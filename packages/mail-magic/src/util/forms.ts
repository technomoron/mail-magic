import path from 'path';

import { ApiError, ApiRequest } from '@technomoron/api-server-base';

import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';

import { CaptchaProvider, verifyCaptcha } from './captcha.js';
import { parseMailbox } from './email.js';
import { extractReplyToFromSubmission } from './form-replyto.js';
import { parseFormSubmissionInput, ParsedFormSubmission } from './form-submission.js';
import { normalizeBoolean, normalizeSlug } from './utils.js';

import type { api_domain } from '../models/domain.js';
import type { api_user } from '../models/user.js';
import type { UploadedFile } from '../types.js';

export function parsePublicSubmissionOrThrow(apireq: ApiRequest): ParsedFormSubmission {
	try {
		return parseFormSubmissionInput(apireq.req.body);
	} catch {
		// Treat malformed input as a bad request (Zod schema failures, non-object bodies, etc).
		throw new ApiError({ code: 400, message: 'Invalid form submission payload' });
	}
}

export function enforceAttachmentPolicy(env: { FORM_MAX_ATTACHMENTS: number }, rawFiles: UploadedFile[]): void {
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

export function filterSubmissionFields(
	rawFields: Record<string, unknown>,
	allowedFields: unknown
): Record<string, unknown> {
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

export async function enforceCaptchaPolicy(params: {
	vars: { FORM_CAPTCHA_REQUIRED: boolean; FORM_CAPTCHA_SECRET: string; FORM_CAPTCHA_PROVIDER: string };
	form: { captcha_required: boolean };
	captchaToken: string;
	clientIp: string;
}): Promise<void> {
	const captchaRequired = Boolean(params.vars.FORM_CAPTCHA_REQUIRED || params.form.captcha_required);
	const captchaSecret = String(params.vars.FORM_CAPTCHA_SECRET ?? '').trim();
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

	const provider = params.vars.FORM_CAPTCHA_PROVIDER as CaptchaProvider;
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

export function buildReplyToValue(
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

export function parseIdnameList(value: unknown, field: string): string[] {
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

export function parseAllowedFields(raw: unknown): string[] {
	if (raw === undefined || raw === null || raw === '') {
		return [];
	}
	const items = Array.isArray(raw) ? raw : [raw];
	const out: string[] = [];
	for (const entry of items) {
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
}

export type FormTemplateInput = {
	template: string;
	sender: string;
	recipient: string;
	idname: string;
	subject: string;
	locale: string;
	secret: string;
	replyto_email: string;
	replyto_from_fields: boolean;
	allowed_fields: string[];
	captcha_required: boolean;
};

export function parseFormTemplatePayload(body: Record<string, unknown>): FormTemplateInput {
	const template = body.template ? String(body.template) : '';
	const sender = body.sender ? String(body.sender) : '';
	const recipient = body.recipient ? String(body.recipient) : '';
	const idname = body.idname ? String(body.idname) : '';
	const subject = body.subject ? String(body.subject) : '';
	const locale = body.locale ? String(body.locale) : '';
	const secret = body.secret ? String(body.secret) : '';
	const replyto_email = String(body.replyto_email ?? '').trim();
	const replyto_from_fields = normalizeBoolean(body.replyto_from_fields);
	const captcha_required = normalizeBoolean(body.captcha_required);
	const allowed_fields = parseAllowedFields(body.allowed_fields);

	return {
		template,
		sender,
		recipient,
		idname,
		subject,
		locale,
		secret,
		replyto_email,
		replyto_from_fields,
		allowed_fields,
		captcha_required
	};
}

export function validateFormTemplatePayload(payload: FormTemplateInput): void {
	if (!payload.template) {
		throw new ApiError({ code: 400, message: 'Missing template data' });
	}
	if (!payload.idname) {
		throw new ApiError({ code: 400, message: 'Missing form identifier' });
	}
	if (!payload.sender) {
		throw new ApiError({ code: 400, message: 'Missing sender address' });
	}
	if (!payload.recipient) {
		throw new ApiError({ code: 400, message: 'Missing recipient address' });
	}
	if (payload.replyto_email) {
		const mailbox = parseMailbox(payload.replyto_email);
		if (!mailbox) {
			throw new ApiError({ code: 400, message: 'Invalid replyto_email address' });
		}
	}
}

export function buildFormTemplatePaths(params: {
	user: api_user;
	domain: api_domain;
	idname: string;
	locale: string;
}): { localeSlug: string; slug: string; filename: string } {
	const userSlug = normalizeSlug(params.user.idname);
	const domainSlug = normalizeSlug(params.domain.name);
	const formSlug = normalizeSlug(params.idname);
	const localeSlug = normalizeSlug(params.locale || params.domain.locale || params.user.locale || '');
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
	return { localeSlug, slug, filename };
}

export async function resolveFormKeyForTemplate(params: {
	user_id: number;
	domain_id: number;
	locale: string;
	idname: string;
}): Promise<string> {
	try {
		const existing = await api_form.findOne({
			where: {
				user_id: params.user_id,
				domain_id: params.domain_id,
				locale: params.locale,
				idname: params.idname
			}
		});
		return existing?.form_key || '';
	} catch {
		return '';
	}
}

export async function resolveRecipients(form: api_form, recipientsRaw: unknown): Promise<api_recipient[]> {
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

	const recipients = parseIdnameList(recipientsRaw, 'recipients');
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

	return resolvedRecipients;
}

export function buildRecipientTo(form: api_form, recipients: api_recipient[]) {
	if (recipients.length === 0) {
		return form.recipient;
	}
	return recipients.map((entry) => {
		const mailbox = parseMailbox(entry.email);
		if (!mailbox) {
			throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid email address' });
		}
		const mappedName = entry.name ? String(entry.name).trim().slice(0, 200) : '';
		if (mappedName && /[\r\n]/.test(mappedName)) {
			throw new ApiError({ code: 500, message: 'Recipient mapping has an invalid name' });
		}
		return mappedName ? { name: mappedName, address: mailbox.address } : mailbox.address;
	});
}

export function getPrimaryRecipientInfo(form: api_form, recipients: api_recipient[]) {
	if (recipients.length > 0) {
		const mailbox = parseMailbox(recipients[0].email);
		return {
			rcptEmail: mailbox?.address ?? recipients[0].email,
			rcptName: recipients[0].name ? String(recipients[0].name).trim().slice(0, 200) : '',
			rcptIdname: recipients[0].idname ?? '',
			rcptIdnames: recipients.map((entry) => entry.idname)
		};
	}
	const mailbox = parseMailbox(String(form.recipient ?? ''));
	return {
		rcptEmail: mailbox?.address ?? String(form.recipient ?? ''),
		rcptName: '',
		rcptIdname: '',
		rcptIdnames: []
	};
}
