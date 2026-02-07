import fs from 'node:fs';
import path from 'path';

import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import emailAddresses, { ParsedMailbox } from 'email-addresses';
import { nanoid } from 'nanoid';
import nunjucks from 'nunjucks';
import { Op } from 'sequelize';

import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';
import { mailApiServer } from '../server.js';
import { buildRequestMeta, normalizeSlug } from '../util.js';

import { assert_domain_and_user } from './auth.js';

import type { mailApiRequest, UploadedFile } from '../types.js';

function getBodyValue(body: Record<string, unknown>, ...keys: string[]): string {
	for (const key of keys) {
		const value = body[key];
		if (Array.isArray(value) && value.length > 0) {
			return String(value[0]);
		}
		if (value !== undefined && value !== null) {
			return String(value);
		}
	}
	return '';
}

type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';

async function verifyCaptcha(params: {
	provider: CaptchaProvider;
	secret: string;
	token: string;
	remoteip: string | null;
}): Promise<boolean> {
	const endpoints: Record<CaptchaProvider, string> = {
		turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		hcaptcha: 'https://hcaptcha.com/siteverify',
		recaptcha: 'https://www.google.com/recaptcha/api/siteverify'
	};
	const endpoint = endpoints[params.provider] ?? endpoints.turnstile;

	const body = new URLSearchParams();
	body.set('secret', params.secret);
	body.set('response', params.token);
	if (params.remoteip) {
		body.set('remoteip', params.remoteip);
	}

	const res = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) {
		return false;
	}

	const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
	return Boolean(data?.success);
}

async function cleanupUploadedFiles(files: UploadedFile[]): Promise<void> {
	await Promise.all(
		files.map(async (file) => {
			if (!file?.path) {
				return;
			}
			try {
				await fs.promises.unlink(file.path);
			} catch {
				// best effort cleanup
			}
		})
	);
}

type RateLimitDecision = { allowed: boolean; retryAfterSec: number };

class FixedWindowRateLimiter {
	private readonly buckets = new Map<string, { windowStartMs: number; count: number }>();

	constructor(private readonly maxKeys = 10_000) {}

	check(key: string, max: number, windowMs: number): RateLimitDecision {
		if (!key || max <= 0 || windowMs <= 0) {
			return { allowed: true, retryAfterSec: 0 };
		}
		const now = Date.now();
		const bucket = this.buckets.get(key);
		if (!bucket || now - bucket.windowStartMs >= windowMs) {
			this.buckets.delete(key);
			this.buckets.set(key, { windowStartMs: now, count: 1 });
			this.prune();
			return { allowed: true, retryAfterSec: 0 };
		}

		bucket.count += 1;
		// Refresh insertion order to keep active entries at the end for pruning.
		this.buckets.delete(key);
		this.buckets.set(key, bucket);

		if (bucket.count <= max) {
			return { allowed: true, retryAfterSec: 0 };
		}

		const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStartMs + windowMs - now) / 1000));
		return { allowed: false, retryAfterSec };
	}

	private prune() {
		while (this.buckets.size > this.maxKeys) {
			const oldest = this.buckets.keys().next().value as string | undefined;
			if (!oldest) {
				break;
			}
			this.buckets.delete(oldest);
		}
	}
}

export class FormAPI extends ApiModule<mailApiServer> {
	private readonly rateLimiter = new FixedWindowRateLimiter();

	private validateEmail(email: string): string | undefined {
		const parsed = emailAddresses.parseOneAddress(email);
		if (parsed) {
			return (parsed as ParsedMailbox).address;
		}
		return undefined;
	}

	private parseMailbox(value: string): ParsedMailbox | undefined {
		const parsed = emailAddresses.parseOneAddress(value);
		if (!parsed) {
			return undefined;
		}
		const mailbox = parsed as ParsedMailbox;
		if (!mailbox?.address) {
			return undefined;
		}
		return mailbox;
	}

	private async postFormRecipient(
		apireq: mailApiRequest
	): Promise<[number, { Status: string; created: boolean; form_key: string }]> {
		await assert_domain_and_user(apireq);

		const body = (apireq.req.body ?? {}) as Record<string, unknown>;
		const idnameRaw = getBodyValue(body, 'idname', 'recipient_idname', 'recipientIdname');
		const emailRaw = getBodyValue(body, 'email');
		const nameRaw = getBodyValue(body, 'name');
		const formKeyRaw = getBodyValue(body, 'form_key', 'formKey', 'formkey');
		const formid = getBodyValue(body, 'formid');
		const localeRaw = getBodyValue(body, 'locale');

		if (!idnameRaw) {
			throw new ApiError({ code: 400, message: 'Missing recipient identifier (idname)' });
		}
		const idname = normalizeSlug(idnameRaw);
		if (!idname) {
			throw new ApiError({ code: 400, message: 'Invalid recipient identifier (idname)' });
		}

		if (!emailRaw) {
			throw new ApiError({ code: 400, message: 'Missing recipient email address' });
		}
		const mailbox = this.parseMailbox(emailRaw);
		if (!mailbox) {
			throw new ApiError({ code: 400, message: 'Invalid recipient email address' });
		}
		const email = mailbox.address;
		if (/[\r\n]/.test(email)) {
			throw new ApiError({ code: 400, message: 'Invalid recipient email address' });
		}

		const name = String(nameRaw || mailbox.name || '')
			.trim()
			.slice(0, 200);
		if (/[\r\n]/.test(name)) {
			throw new ApiError({ code: 400, message: 'Invalid recipient name' });
		}

		const user = apireq.user!;
		const domain = apireq.domain!;

		let form_key = '';
		if (formKeyRaw) {
			const form = await api_form.findOne({ where: { form_key: formKeyRaw } });
			if (!form || form.domain_id !== domain.domain_id || form.user_id !== user.user_id) {
				throw new ApiError({ code: 404, message: 'No such form_key for this domain' });
			}
			form_key = form.form_key ?? '';
		} else if (formid) {
			const locale = localeRaw ? normalizeSlug(localeRaw) : '';
			if (locale) {
				const form = await api_form.findOne({
					where: { user_id: user.user_id, domain_id: domain.domain_id, locale, idname: formid }
				});
				if (!form) {
					throw new ApiError({ code: 404, message: 'No such form for this domain/locale' });
				}
				form_key = form.form_key ?? '';
			} else {
				const matches = await api_form.findAll({
					where: { user_id: user.user_id, domain_id: domain.domain_id, idname: formid },
					limit: 2
				});
				if (matches.length === 0) {
					throw new ApiError({ code: 404, message: 'No such form for this domain' });
				}
				if (matches.length > 1) {
					throw new ApiError({
						code: 409,
						message: 'Form identifier is ambiguous; provide locale or form_key'
					});
				}
				form_key = matches[0].form_key ?? '';
			}
		}

		const record = {
			domain_id: domain.domain_id,
			form_key,
			idname,
			email,
			name
		};

		let created = false;
		try {
			const [, wasCreated] = await api_recipient.upsert(record, {
				returning: true,
				conflictFields: ['domain_id', 'form_key', 'idname']
			});
			created = wasCreated ?? false;
		} catch (error: unknown) {
			throw new ApiError({
				code: 500,
				message: this.server!.guessExceptionText(error, 'Unknown Sequelize Error on upsert recipient')
			});
		}

		return [200, { Status: 'OK', created, form_key }];
	}

	private async postFormTemplate(
		apireq: mailApiRequest
	): Promise<[number, { Status: string; created: boolean; form_key: string }]> {
		await assert_domain_and_user(apireq);

		const {
			template,
			sender = '',
			recipient = '',
			idname,
			subject = '',
			locale = '',
			secret = '',
			captcha_required: captchaRequiredRaw,
			captchaRequired: captchaRequiredAlt
		} = apireq.req.body;

		const captcha_required = (() => {
			const value = captchaRequiredRaw ?? captchaRequiredAlt;
			if (typeof value === 'boolean') {
				return value;
			}
			if (typeof value === 'number') {
				return value !== 0;
			}
			const normalized = String(value ?? '')
				.trim()
				.toLowerCase();
			return ['true', '1', 'yes', 'on'].includes(normalized);
		})();

		if (!template) {
			throw new ApiError({ code: 400, message: 'Missing template data' });
		}
		if (!idname) {
			throw new ApiError({ code: 400, message: 'Missing form identifier' });
		}
		if (!sender) {
			throw new ApiError({ code: 400, message: 'Missing sender address' });
		}
		if (!recipient) {
			throw new ApiError({ code: 400, message: 'Missing recipient address' });
		}

		const user = apireq.user!;
		const domain = apireq.domain!;
		const resolvedLocale = locale || apireq.locale || '';
		const userSlug = normalizeSlug(user.idname);
		const domainSlug = normalizeSlug(domain.name);
		const formSlug = normalizeSlug(idname);
		const localeSlug = normalizeSlug(resolvedLocale || domain.locale || user.locale || '');
		const slug = `${userSlug}-${domainSlug}${localeSlug ? '-' + localeSlug : ''}-${formSlug}`;
		const filenameParts = [domainSlug, 'form-template'];
		if (localeSlug) {
			filenameParts.push(localeSlug);
		}
		filenameParts.push(formSlug);
		let filename = path.join(...filenameParts);
		if (!filename.endsWith('.njk')) {
			filename += '.njk';
		}

		let form_key = '';
		try {
			const existing = await api_form.findOne({
				where: {
					user_id: user.user_id,
					domain_id: domain.domain_id,
					locale: localeSlug,
					idname
				}
			});
			form_key = existing?.form_key || nanoid();
		} catch {
			form_key = nanoid();
		}

		const record = {
			form_key,
			user_id: user.user_id,
			domain_id: domain.domain_id,
			locale: localeSlug,
			idname,
			sender,
			recipient,
			subject,
			template,
			slug,
			filename,
			secret,
			captcha_required,
			files: []
		};

		let created = false;
		try {
			const [form, wasCreated] = await api_form.upsert(record, {
				returning: true,
				conflictFields: ['user_id', 'domain_id', 'locale', 'idname']
			});
			created = wasCreated ?? false;
			form_key = form.form_key || form_key;
			this.server.storage.print_debug(`Form template upserted: ${form.idname} (created=${wasCreated})`);
		} catch (error: unknown) {
			throw new ApiError({
				code: 500,
				message: this.server!.guessExceptionText(error, 'Unknown Sequelize Error on upsert form template')
			});
		}

		return [200, { Status: 'OK', created, form_key }];
	}

	private async postSendForm(apireq: ApiRequest): Promise<[number, Record<string, unknown>]> {
		const env = this.server.storage.env;
		const rawFiles = Array.isArray(apireq.req.files) ? (apireq.req.files as UploadedFile[]) : [];
		const keepUploads = env.FORM_KEEP_UPLOADS;
		try {
			const body = (apireq.req.body ?? {}) as Record<string, unknown>;
			const formid = getBodyValue(body, 'formid');
			const form_key = getBodyValue(body, 'form_key', 'formkey', 'formKey');
			const domainName = getBodyValue(body, 'domain');
			const localeRaw = getBodyValue(body, 'locale');
			const secret = getBodyValue(body, 'secret');
			const recipient = getBodyValue(body, 'recipient');
			const recipientIdnameRaw = getBodyValue(
				body,
				'recipient_idname',
				'recipientIdname',
				'recipient_slug',
				'recipientSlug',
				'recipient_key',
				'recipientKey'
			);
			const replyTo = getBodyValue(body, 'replyTo', 'reply_to');
			const vars = body.vars ?? {};

			const clientIp = apireq.getClientIp() ?? '';
			const windowMs = Math.max(0, env.FORM_RATE_LIMIT_WINDOW_SEC) * 1000;
			const decision = this.rateLimiter.check(
				`form-message:${clientIp || 'unknown'}`,
				env.FORM_RATE_LIMIT_MAX,
				windowMs
			);
			if (!decision.allowed) {
				apireq.res.set('Retry-After', String(decision.retryAfterSec));
				throw new ApiError({ code: 429, message: 'Too many form submissions; try again later' });
			}

			if (env.FORM_MAX_ATTACHMENTS === 0 && rawFiles.length > 0) {
				throw new ApiError({ code: 413, message: 'This endpoint does not accept file attachments' });
			}
			if (env.FORM_MAX_ATTACHMENTS > 0 && rawFiles.length > env.FORM_MAX_ATTACHMENTS) {
				throw new ApiError({
					code: 413,
					message: `Too many attachments: ${rawFiles.length} > ${env.FORM_MAX_ATTACHMENTS}`
				});
			}

			if (!form_key && !formid) {
				throw new ApiError({ code: 404, message: 'Missing formid field in form' });
			}

			let form: api_form | null = null;
			if (form_key) {
				form = await api_form.findOne({ where: { form_key } });
				if (!form) {
					throw new ApiError({ code: 404, message: 'No such form_key' });
				}
			} else {
				if (!domainName) {
					throw new ApiError({ code: 400, message: 'Missing domain (or form_key)' });
				}

				const domains = await api_domain.findAll({ where: { name: domainName } });
				if (domains.length === 0) {
					throw new ApiError({ code: 404, message: `No such domain: ${domainName}` });
				}

				const domainIds = domains.map((domain) => domain.domain_id);
				const domainWhere = { [Op.in]: domainIds };

				if (localeRaw) {
					const locale = normalizeSlug(localeRaw);
					form = await api_form.findOne({
						where: {
							idname: formid,
							domain_id: domainWhere,
							locale
						}
					});
				} else if (domains.length === 1) {
					const locale = normalizeSlug(domains[0].locale || '');
					if (locale) {
						form = await api_form.findOne({
							where: {
								idname: formid,
								domain_id: domainWhere,
								locale
							}
						});
					}
				}

				if (!form) {
					const matches = await api_form.findAll({
						where: {
							idname: formid,
							domain_id: domainWhere
						},
						limit: 2
					});
					if (matches.length === 1) {
						form = matches[0];
					} else if (matches.length > 1) {
						throw new ApiError({
							code: 409,
							message: 'Form identifier is ambiguous; provide locale or form_key'
						});
					}
				}
			}

			if (!form) {
				throw new ApiError({ code: 404, message: `No such form: ${formid}` });
			}

			if (form.secret && !secret) {
				throw new ApiError({ code: 401, message: 'This form requires a secret key' });
			}
			if (form.secret && form.secret !== secret) {
				throw new ApiError({ code: 401, message: 'Bad form secret' });
			}

			const captchaRequired = Boolean(env.FORM_CAPTCHA_REQUIRED || form.captcha_required);
			const captchaSecret = String(env.FORM_CAPTCHA_SECRET ?? '').trim();
			const captchaToken = getBodyValue(
				body,
				'cf-turnstile-response',
				'h-captcha-response',
				'g-recaptcha-response',
				'captcha',
				'captchaToken',
				'captcha_token'
			);
			if (!captchaSecret) {
				if (captchaRequired) {
					throw new ApiError({ code: 500, message: 'Captcha is required but not configured on the server' });
				}
			} else if (!captchaToken) {
				if (captchaRequired) {
					throw new ApiError({ code: 403, message: 'Captcha token required' });
				}
			} else {
				const provider = env.FORM_CAPTCHA_PROVIDER as CaptchaProvider;
				const ok = await verifyCaptcha({
					provider,
					secret: captchaSecret,
					token: captchaToken,
					remoteip: clientIp
				});
				if (!ok) {
					throw new ApiError({ code: 403, message: 'Captcha verification failed' });
				}
			}

			if (recipient && !form.secret) {
				throw new ApiError({ code: 401, message: "'recipient' parameterer requires form secret to be set" });
			}
			let normalizedReplyTo: string | undefined;
			let normalizedRecipient: string | undefined;
			if (replyTo) {
				normalizedReplyTo = this.validateEmail(replyTo);
				if (!normalizedReplyTo) {
					throw new ApiError({ code: 400, message: 'Invalid reply-to email address' });
				}
			}
			if (recipient) {
				normalizedRecipient = this.validateEmail(recipient);
				if (!normalizedRecipient) {
					throw new ApiError({ code: 400, message: 'Invalid recipient email address' });
				}
			}

			if (recipientIdnameRaw && !normalizeSlug(recipientIdnameRaw)) {
				throw new ApiError({ code: 400, message: 'Invalid recipient identifier (recipient_idname)' });
			}
			const recipientIdname = normalizeSlug(recipientIdnameRaw);
			let resolvedRecipient: api_recipient | null = null;
			if (!normalizedRecipient && recipientIdname) {
				const scopeFormKey = form.form_key ?? '';
				if (scopeFormKey) {
					resolvedRecipient = await api_recipient.findOne({
						where: {
							domain_id: form.domain_id,
							form_key: scopeFormKey,
							idname: recipientIdname
						}
					});
				}
				if (!resolvedRecipient) {
					resolvedRecipient = await api_recipient.findOne({
						where: {
							domain_id: form.domain_id,
							form_key: '',
							idname: recipientIdname
						}
					});
				}
				if (!resolvedRecipient) {
					throw new ApiError({ code: 404, message: 'Unknown recipient identifier' });
				}
			}

			let parsedVars: unknown = vars ?? {};
			if (typeof vars === 'string') {
				try {
					parsedVars = JSON.parse(vars);
				} catch {
					throw new ApiError({ code: 400, message: 'Invalid JSON provided in "vars"' });
				}
			}
			const thevars = parsedVars as Record<string, unknown>;

			/*
		console.log('Headers:', apireq.req.headers);
		console.log('Body:', JSON.stringify(apireq.req.body, null, 2));
		console.log('Files:', JSON.stringify(apireq.req.files, null, 2));
		*/

			const domainRecord = await api_domain.findOne({ where: { domain_id: form.domain_id } });
			await this.server.storage.relocateUploads(domainRecord?.name ?? null, rawFiles);
			const attachments = rawFiles.map((file) => ({
				filename: file.originalname,
				path: file.path
			}));

			const attachmentMap: Record<string, string> = {};
			for (const file of rawFiles) {
				attachmentMap[file.fieldname] = file.originalname;
			}

			const meta = buildRequestMeta(apireq.req);

			const mappedEmailAddress = resolvedRecipient ? this.validateEmail(resolvedRecipient.email) : undefined;
			if (resolvedRecipient && !mappedEmailAddress) {
				throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid email address' });
			}
			const mappedName = resolvedRecipient?.name ? String(resolvedRecipient.name).trim().slice(0, 200) : '';
			if (mappedName && /[\r\n]/.test(mappedName)) {
				throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid name' });
			}

			const to = resolvedRecipient
				? mappedName
					? { name: mappedName, address: mappedEmailAddress! }
					: mappedEmailAddress!
				: normalizedRecipient || form.recipient;

			const rcptEmailForTemplate = resolvedRecipient
				? mappedEmailAddress!
				: normalizedRecipient || form.recipient;

			const context = {
				...thevars,
				_rcpt_email_: rcptEmailForTemplate,
				_rcpt_name_: mappedName,
				_rcpt_idname_: recipientIdname,
				_attachments_: attachmentMap,
				_vars_: thevars,
				_fields_: apireq.req.body,
				_files_: rawFiles,
				_meta_: meta
			};

			nunjucks.configure({ autoescape: this.server.storage.env.AUTOESCAPE_HTML });
			const html = nunjucks.renderString(form.template, context);

			const mailOptions = {
				from: form.sender,
				to,
				subject: form.subject,
				html,
				attachments,
				...(normalizedReplyTo ? { replyTo: normalizedReplyTo } : {})
			};

			try {
				const info = await this.server.storage.transport!.sendMail(mailOptions);
				this.server.storage.print_debug('Email sent: ' + info.response);
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.server.storage.print_debug('Error sending email: ' + errorMessage);
				return [500, { error: `Error sending email: ${errorMessage}` }];
			}

			return [200, {}];
		} finally {
			if (!keepUploads) {
				await cleanupUploadedFiles(rawFiles);
			}
		}
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{
				method: 'post',
				path: '/v1/form/recipient',
				handler: (req) => this.postFormRecipient(req as mailApiRequest),
				auth: { type: 'yes', req: 'any' }
			},
			{
				method: 'post',
				path: '/v1/form/template',
				handler: (req) => this.postFormTemplate(req as mailApiRequest),
				auth: { type: 'yes', req: 'any' }
			},
			{
				method: 'post',
				path: '/v1/form/message',
				handler: (req) => this.postSendForm(req),
				auth: { type: 'none', req: 'any' }
			}
		];
	}
}
