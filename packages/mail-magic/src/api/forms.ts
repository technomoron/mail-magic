import path from 'path';

import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import emailAddresses, { ParsedMailbox } from 'email-addresses';
import { nanoid } from 'nanoid';
import nunjucks from 'nunjucks';
import { Op } from 'sequelize';

import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
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

export class FormAPI extends ApiModule<mailApiServer> {
	private validateEmail(email: string): string | undefined {
		const parsed = emailAddresses.parseOneAddress(email);
		if (parsed) {
			return (parsed as ParsedMailbox).address;
		}
		return undefined;
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
			secret = ''
		} = apireq.req.body;

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
		const body = (apireq.req.body ?? {}) as Record<string, unknown>;
		const formid = getBodyValue(body, 'formid');
		const form_key = getBodyValue(body, 'form_key', 'formkey', 'formKey');
		const domainName = getBodyValue(body, 'domain');
		const localeRaw = getBodyValue(body, 'locale');
		const secret = getBodyValue(body, 'secret');
		const recipient = getBodyValue(body, 'recipient');
		const replyTo = getBodyValue(body, 'replyTo', 'reply_to');
		const vars = body.vars ?? {};

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

		const rawFiles = Array.isArray(apireq.req.files) ? (apireq.req.files as UploadedFile[]) : [];
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

		const context = {
			...thevars,
			_rcpt_email_: recipient,
			_attachments_: attachmentMap,
			_vars_: thevars,
			_fields_: apireq.req.body,
			_files_: rawFiles,
			_meta_: meta
		};

		nunjucks.configure({ autoescape: true });
		const html = nunjucks.renderString(form.template, context);

		const mailOptions = {
			from: form.sender,
			to: normalizedRecipient || form.recipient,
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
	}

	override defineRoutes(): ApiRoute[] {
		return [
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
