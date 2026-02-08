import fs from 'node:fs';
import path from 'path';

import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import emailAddresses, { ParsedMailbox } from 'email-addresses';
import { nanoid } from 'nanoid';
import nunjucks from 'nunjucks';
import { UniqueConstraintError } from 'sequelize';

import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';
import { mailApiServer } from '../server.js';
import { CaptchaProvider, verifyCaptcha } from '../util/captcha.js';
import { buildRequestMeta, normalizeSlug } from '../util.js';

import { assert_domain_and_user } from './auth.js';
import { extractReplyToFromSubmission } from './form-replyto.js';
import { parseFormSubmissionInput } from './form-submission.js';

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

function parsePublicSubmissionOrThrow(apireq: ApiRequest): ReturnType<typeof parseFormSubmissionInput> {
	try {
		return parseFormSubmissionInput(apireq.req.body);
	} catch {
		// Treat malformed input as a bad request (Zod schema failures, non-object bodies, etc).
		throw new ApiError({ code: 400, message: 'Invalid form submission payload' });
	}
}

function enforceFormRateLimit(
	limiter: FixedWindowRateLimiter,
	env: { FORM_RATE_LIMIT_WINDOW_SEC: number; FORM_RATE_LIMIT_MAX: number },
	apireq: ApiRequest
): void {
	const clientIp = apireq.getClientIp() ?? '';
	const windowMs = Math.max(0, env.FORM_RATE_LIMIT_WINDOW_SEC) * 1000;
	const decision = limiter.check(`form-message:${clientIp || 'unknown'}`, env.FORM_RATE_LIMIT_MAX, windowMs);
	if (!decision.allowed) {
		apireq.res.set('Retry-After', String(decision.retryAfterSec));
		throw new ApiError({ code: 429, message: 'Too many form submissions; try again later' });
	}
}

function enforceAttachmentPolicy(env: { FORM_MAX_ATTACHMENTS: number }, rawFiles: UploadedFile[]): void {
	if (env.FORM_MAX_ATTACHMENTS === 0 && rawFiles.length > 0) {
		throw new ApiError({ code: 413, message: 'This endpoint does not accept file attachments' });
	}
	for (const file of rawFiles) {
		if (!file?.fieldname) {
			continue;
		}
		if (!file.fieldname.startsWith('_mm_file')) {
			throw new ApiError({
				code: 400,
				message: 'Invalid upload field name. Use _mm_file* for attachments.'
			});
		}
	}
	if (env.FORM_MAX_ATTACHMENTS > 0 && rawFiles.length > env.FORM_MAX_ATTACHMENTS) {
		throw new ApiError({
			code: 413,
			message: `Too many attachments: ${rawFiles.length} > ${env.FORM_MAX_ATTACHMENTS}`
		});
	}
}

function filterSubmissionFields(rawFields: Record<string, unknown>, allowedFields: unknown): Record<string, unknown> {
	const allowed = Array.isArray(allowedFields) ? allowedFields : [];
	if (!allowed.length) {
		return rawFields;
	}
	const filtered: Record<string, unknown> = {};

	// Always allow Reply-To derivation fields even when allowed_fields is configured.
	const alwaysAllow = ['email', 'name', 'first_name', 'last_name'];
	for (const key of alwaysAllow) {
		if (Object.prototype.hasOwnProperty.call(rawFields, key)) {
			filtered[key] = rawFields[key];
		}
	}
	for (const key of allowed) {
		const k = typeof key === 'string' ? key : String(key ?? '').trim();
		if (!k) {
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(rawFields, k)) {
			filtered[k] = rawFields[k];
		}
	}
	return filtered;
}

async function enforceCaptchaPolicy(params: {
	env: { FORM_CAPTCHA_REQUIRED: boolean; FORM_CAPTCHA_SECRET: string; FORM_CAPTCHA_PROVIDER: string };
	form: { captcha_required: boolean };
	captchaToken: string;
	clientIp: string;
}): Promise<void> {
	const captchaRequired = Boolean(params.env.FORM_CAPTCHA_REQUIRED || params.form.captcha_required);
	const captchaSecret = String(params.env.FORM_CAPTCHA_SECRET ?? '').trim();
	if (!captchaSecret) {
		if (captchaRequired) {
			throw new ApiError({ code: 500, message: 'Captcha is required but not configured on the server' });
		}
		return;
	}
	if (!params.captchaToken) {
		if (captchaRequired) {
			throw new ApiError({ code: 403, message: 'Captcha token required' });
		}
		return;
	}

	const provider = params.env.FORM_CAPTCHA_PROVIDER as CaptchaProvider;
	const ok = await verifyCaptcha({
		provider,
		secret: captchaSecret,
		token: params.captchaToken,
		remoteip: params.clientIp || null
	});
	if (!ok) {
		throw new ApiError({ code: 403, message: 'Captcha verification failed' });
	}
}

function buildAttachments(rawFiles: UploadedFile[]): {
	attachments: Array<{ filename: string; path: string }>;
	attachmentMap: Record<string, string>;
} {
	const attachments = rawFiles.map((file) => ({
		filename: file.originalname,
		path: file.path
	}));
	const attachmentMap: Record<string, string> = {};
	for (const file of rawFiles) {
		attachmentMap[file.fieldname] = file.originalname;
	}
	return { attachments, attachmentMap };
}

function buildReplyToValue(
	form: { replyto_email: string; replyto_from_fields: boolean },
	fields: Record<string, unknown>
) {
	const forced = typeof form.replyto_email === 'string' ? form.replyto_email.trim() : '';
	const forcedValue = forced ? forced : '';

	if (form.replyto_from_fields) {
		const extracted = extractReplyToFromSubmission(fields);
		if (extracted) {
			return extracted;
		}
		return forcedValue || undefined;
	}

	return forcedValue || undefined;
}

export class FormAPI extends ApiModule<mailApiServer> {
	private readonly rateLimiter = new FixedWindowRateLimiter();

	private parseIdnameList(value: unknown, field: string): string[] {
		if (value === undefined || value === null || value === '') {
			return [];
		}

		const raw = Array.isArray(value) ? value : [value];
		const out: string[] = [];
		for (const entry of raw) {
			const str = String(entry ?? '').trim();
			if (!str) {
				continue;
			}
			// Allow comma-separated convenience in form-encoded inputs while keeping the field name canonical.
			const parts = str.split(',').map((p) => p.trim());
			for (const part of parts) {
				if (!part) {
					continue;
				}
				const normalized = normalizeSlug(part);
				if (!normalized) {
					throw new ApiError({ code: 400, message: `Invalid ${field} identifier "${part}"` });
				}
				out.push(normalized);
			}
		}
		return Array.from(new Set(out));
	}

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

	private normalizeBoolean(value: unknown): boolean {
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
	}

	private async postFormRecipient(
		apireq: mailApiRequest
	): Promise<[number, { Status: string; created: boolean; form_key: string }]> {
		await assert_domain_and_user(apireq);

		const body = (apireq.req.body ?? {}) as Record<string, unknown>;
		const idnameRaw = getBodyValue(body, 'idname');
		const emailRaw = getBodyValue(body, 'email');
		const nameRaw = getBodyValue(body, 'name');
		const formKeyRaw = getBodyValue(body, 'form_key');
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
			replyto_email: replytoEmailRaw = '',
			replyto_from_fields: replytoFromFieldsRaw = false,
			allowed_fields: allowedFieldsRaw,
			captcha_required: captchaRequiredRaw
		} = apireq.req.body;

		const captcha_required = this.normalizeBoolean(captchaRequiredRaw);
		const replyto_from_fields = this.normalizeBoolean(replytoFromFieldsRaw);
		const replyto_email = String(replytoEmailRaw ?? '').trim();
		const allowed_fields = (() => {
			if (allowedFieldsRaw === undefined || allowedFieldsRaw === null || allowedFieldsRaw === '') {
				return [] as string[];
			}
			const raw = Array.isArray(allowedFieldsRaw) ? allowedFieldsRaw : [allowedFieldsRaw];
			const out: string[] = [];
			for (const entry of raw) {
				if (typeof entry === 'string') {
					// Accept JSON arrays and comma-separated convenience.
					const trimmed = entry.trim();
					if (trimmed.startsWith('[')) {
						try {
							const parsed = JSON.parse(trimmed) as unknown;
							if (Array.isArray(parsed)) {
								for (const item of parsed) {
									const key = String(item ?? '').trim();
									if (key) {
										out.push(key);
									}
								}
								continue;
							}
						} catch {
							// fall back to comma-splitting below
						}
					}
					for (const part of trimmed.split(',').map((p) => p.trim())) {
						if (part) {
							out.push(part);
						}
					}
				} else {
					const key = String(entry ?? '').trim();
					if (key) {
						out.push(key);
					}
				}
			}
			return Array.from(new Set(out));
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

		if (replyto_email) {
			const mailbox = this.parseMailbox(replyto_email);
			if (!mailbox) {
				throw new ApiError({ code: 400, message: 'Invalid replyto_email address' });
			}
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
			replyto_email,
			replyto_from_fields,
			allowed_fields,
			captcha_required,
			files: []
		};

		let created = false;
		for (let attempt = 0; attempt < 10; attempt++) {
			try {
				const [form, wasCreated] = await api_form.upsert(record, {
					returning: true,
					conflictFields: ['user_id', 'domain_id', 'locale', 'idname']
				});
				created = wasCreated ?? false;
				form_key = form.form_key || form_key;
				this.server.storage.print_debug(`Form template upserted: ${form.idname} (created=${wasCreated})`);
				break;
			} catch (error: unknown) {
				if (error instanceof UniqueConstraintError) {
					const conflicted = (error as UniqueConstraintError).errors?.some((e) => e.path === 'form_key');
					if (conflicted) {
						record.form_key = nanoid();
						form_key = record.form_key;
						continue;
					}
				}
				throw new ApiError({
					code: 500,
					message: this.server!.guessExceptionText(error, 'Unknown Sequelize Error on upsert form template')
				});
			}
		}

		return [200, { Status: 'OK', created, form_key }];
	}

	private async postSendForm(apireq: ApiRequest): Promise<[number, Record<string, unknown>]> {
		const env = this.server.storage.env;
		const rawFiles = Array.isArray(apireq.req.files) ? (apireq.req.files as UploadedFile[]) : [];
		const keepUploads = env.FORM_KEEP_UPLOADS;
		try {
			const parsedInput = parsePublicSubmissionOrThrow(apireq);
			const form_key = parsedInput.mm.form_key;
			const localeRaw = parsedInput.mm.locale;
			const captchaToken = parsedInput.mm.captcha_token;
			const recipientsRaw = parsedInput.mm.recipients_raw;

			enforceFormRateLimit(this.rateLimiter, env, apireq);
			enforceAttachmentPolicy(env, rawFiles);

			if (!form_key) {
				throw new ApiError({ code: 400, message: 'Missing form_key' });
			}

			const form = await api_form.findOne({ where: { form_key } });
			if (!form) {
				throw new ApiError({ code: 404, message: 'No such form_key' });
			}

			const fields = filterSubmissionFields(parsedInput.fields, form.allowed_fields);

			const clientIp = apireq.getClientIp() ?? '';
			await enforceCaptchaPolicy({ env, form, captchaToken, clientIp });

			const scopeFormKey = String(form.form_key ?? '').trim();
			if (!scopeFormKey) {
				throw new ApiError({ code: 500, message: 'Form is missing a form_key' });
			}

			const resolveRecipient = async (idname: string): Promise<api_recipient | null> => {
				const scoped = await api_recipient.findOne({
					where: { domain_id: form.domain_id, form_key: scopeFormKey, idname }
				});
				if (scoped) {
					return scoped;
				}
				return api_recipient.findOne({ where: { domain_id: form.domain_id, form_key: '', idname } });
			};

			const recipients = this.parseIdnameList(recipientsRaw, 'recipients');
			if (recipients.length > 25) {
				throw new ApiError({ code: 400, message: 'Too many recipients requested' });
			}

			const resolvedRecipients: api_recipient[] = [];
			for (const idname of recipients) {
				const record = await resolveRecipient(idname);
				if (!record) {
					throw new ApiError({ code: 404, message: `Unknown recipient identifier "${idname}"` });
				}
				resolvedRecipients.push(record);
			}

			const thevars: Record<string, unknown> = {};

			/*
		console.log('Headers:', apireq.req.headers);
		console.log('Body:', JSON.stringify(apireq.req.body, null, 2));
		console.log('Files:', JSON.stringify(apireq.req.files, null, 2));
		*/

			const domainRecord = await api_domain.findOne({ where: { domain_id: form.domain_id } });
			await this.server.storage.relocateUploads(domainRecord?.name ?? null, rawFiles);
			const { attachments, attachmentMap } = buildAttachments(rawFiles);

			const meta = buildRequestMeta(apireq.req);

			const to = (() => {
				if (resolvedRecipients.length === 0) {
					return form.recipient;
				}
				return resolvedRecipients.map((entry) => {
					const mailbox = this.parseMailbox(entry.email);
					if (!mailbox) {
						throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid email address' });
					}
					const mappedName = entry.name ? String(entry.name).trim().slice(0, 200) : '';
					if (mappedName && /[\r\n]/.test(mappedName)) {
						throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid name' });
					}
					return mappedName ? { name: mappedName, address: mailbox.address } : mailbox.address;
				});
			})();

			const rcptEmailForTemplate = (() => {
				if (resolvedRecipients.length > 0) {
					const mailbox = this.parseMailbox(resolvedRecipients[0].email);
					return mailbox?.address ?? resolvedRecipients[0].email;
				}
				const mailbox = this.parseMailbox(String(form.recipient ?? ''));
				return mailbox?.address ?? String(form.recipient ?? '');
			})();

			const replyToValue = buildReplyToValue(form, fields);

			const context = {
				_mm_form_key: form_key,
				_mm_recipients: recipients,
				_mm_locale: localeRaw,
				_rcpt_email_: rcptEmailForTemplate,
				_rcpt_name_: resolvedRecipients[0]?.name ? String(resolvedRecipients[0].name).trim().slice(0, 200) : '',
				_rcpt_idname_: resolvedRecipients[0]?.idname ?? '',
				_rcpt_idnames_: resolvedRecipients.map((entry) => entry.idname),
				_attachments_: attachmentMap,
				_vars_: thevars,
				_fields_: fields,
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
				...(replyToValue ? { replyTo: replyToValue } : {})
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
