import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import { nanoid } from 'nanoid';
import nunjucks from 'nunjucks';
import { UniqueConstraintError } from 'sequelize';

import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';
import { mailApiServer } from '../server.js';
import { parseMailbox } from '../util/email.js';
import {
	buildFormTemplatePaths,
	buildRecipientTo,
	buildReplyToValue,
	enforceAttachmentPolicy,
	enforceCaptchaPolicy,
	filterSubmissionFields,
	getPrimaryRecipientInfo,
	parseIdnameList,
	parseFormTemplatePayload,
	parsePublicSubmissionOrThrow,
	resolveFormKeyForTemplate,
	resolveRecipients,
	validateFormTemplatePayload
} from '../util/forms.js';
import { FixedWindowRateLimiter, enforceFormRateLimit } from '../util/ratelimit.js';
import { buildAttachments, cleanupUploadedFiles } from '../util/uploads.js';
import { buildRequestMeta, getBodyValue, normalizeSlug } from '../util.js';

import { assert_domain_and_user } from './auth.js';

import type { mailApiRequest, UploadedFile } from '../types.js';
import type { ParsedMailbox } from 'email-addresses';

export class FormAPI extends ApiModule<mailApiServer> {
	private readonly rateLimiter = new FixedWindowRateLimiter();

	private parseMailbox(value: string): ParsedMailbox | undefined {
		return parseMailbox(value);
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

		const payload = parseFormTemplatePayload(apireq.req.body ?? {});
		validateFormTemplatePayload(payload);

		const user = apireq.user!;
		const domain = apireq.domain!;
		const resolvedLocale = payload.locale || apireq.locale || '';
		const { localeSlug, slug, filename } = buildFormTemplatePaths({
			user,
			domain,
			idname: payload.idname,
			locale: resolvedLocale
		});
		let form_key =
			(await resolveFormKeyForTemplate({
				user_id: user.user_id,
				domain_id: domain.domain_id,
				locale: localeSlug,
				idname: payload.idname
			})) || nanoid();

		const record = {
			form_key,
			user_id: user.user_id,
			domain_id: domain.domain_id,
			locale: localeSlug,
			idname: payload.idname,
			sender: payload.sender,
			recipient: payload.recipient,
			subject: payload.subject,
			template: payload.template,
			slug,
			filename,
			secret: payload.secret,
			replyto_email: payload.replyto_email,
			replyto_from_fields: payload.replyto_from_fields,
			allowed_fields: payload.allowed_fields,
			captcha_required: payload.captcha_required,
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
		const env = this.server.storage.vars;
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
			await enforceCaptchaPolicy({ vars: env, form, captchaToken, clientIp });
			const resolvedRecipients = await resolveRecipients(form, recipientsRaw);
			const recipients = parseIdnameList(recipientsRaw, 'recipients');
			const { rcptEmail, rcptName, rcptIdname, rcptIdnames } = getPrimaryRecipientInfo(form, resolvedRecipients);
			const domainRecord = await api_domain.findOne({ where: { domain_id: form.domain_id } });
			await this.server.storage.relocateUploads(domainRecord?.name ?? null, rawFiles);
			const { attachments, attachmentMap } = buildAttachments(rawFiles);
			const meta = buildRequestMeta(apireq.req);
			const to = buildRecipientTo(form, resolvedRecipients);
			const replyToValue = buildReplyToValue(form, fields);
			const context = {
				_mm_form_key: form_key,
				_mm_recipients: recipients,
				_mm_locale: localeRaw,
				_rcpt_email_: rcptEmail,
				_rcpt_name_: rcptName,
				_rcpt_idname_: rcptIdname,
				_rcpt_idnames_: rcptIdnames,
				_attachments_: attachmentMap,
				_vars_: {},
				_fields_: fields,
				_files_: rawFiles,
				_meta_: meta
			};

			nunjucks.configure({ autoescape: this.server.storage.vars.AUTOESCAPE_HTML });
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
