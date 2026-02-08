import fs from 'fs';
import path from 'path';

import emailAddresses, { ParsedMailbox } from 'email-addresses';
import nunjucks from 'nunjucks';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type RequestBody = JsonValue | object;

interface templateData {
	template: string;
	domain: string;
	sender?: string;
	name?: string;
	subject?: string;
	locale?: string;
	part?: boolean;
}

interface formTemplateData {
	idname: string;
	domain: string;
	template: string;
	sender: string;
	recipient: string;
	subject?: string;
	locale?: string;
	secret?: string;
}

interface sendTemplateData {
	name: string;
	rcpt: string;
	domain: string;
	locale?: string;
	vars?: Record<string, unknown>;
	replyTo?: string;
	headers?: Record<string, string>;
	attachments?: AttachmentInput[];
}

interface sendFormData {
	_mm_form_key: string;
	_mm_locale?: string;
	_mm_recipients?: string[] | string;
	fields?: Record<string, unknown>;
	attachments?: AttachmentInput[];
}

type AttachmentInput = {
	path: string;
	filename?: string;
	contentType?: string;
	field?: string;
};

type UploadAssetInput = string | AttachmentInput;

interface uploadAssetsData {
	domain: string;
	files: UploadAssetInput[];
	templateType?: 'tx' | 'form';
	template?: string;
	locale?: string;
	path?: string;
}

class templateClient {
	private baseURL: string;
	private apiKey: string;

	constructor(baseURL: string, apiKey: string) {
		this.baseURL = baseURL;
		this.apiKey = apiKey;
		if (!apiKey || !baseURL) {
			throw new Error('Apikey/api-url required');
		}
	}

	async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', command: string, body?: RequestBody): Promise<T> {
		const url = `${this.baseURL}${command}`;
		const headers: Record<string, string> = {
			Accept: 'application/json',
			Authorization: `Bearer apikey-${this.apiKey}`
		};
		const options: RequestInit = {
			method,
			headers
		};
		// Avoid GET bodies (they're non-standard and can break under some proxies).
		if (method !== 'GET' && body !== undefined) {
			headers['Content-Type'] = 'application/json';
			options.body = JSON.stringify(body);
		}
		//        console.log(JSON.stringify({ options, url }));
		const response = await fetch(url, options);
		const j = await response.json();
		if (response.ok) {
			return j;
		}
		// console.log(JSON.stringify(j, undefined, 2));
		if (j && j.message) {
			throw new Error(`FETCH FAILED: ${response.status} ${j.message}`);
		} else {
			throw new Error(`FETCH FAILED: ${response.status} ${response.statusText}`);
		}
	}

	async get<T>(command: string): Promise<T> {
		return this.request<T>('GET', command);
	}

	async post<T>(command: string, body: RequestBody): Promise<T> {
		return this.request<T>('POST', command, body);
	}

	async put<T>(command: string, body: RequestBody): Promise<T> {
		return this.request<T>('PUT', command, body);
	}

	async delete<T>(command: string, body?: RequestBody): Promise<T> {
		return this.request<T>('DELETE', command, body);
	}

	validateEmails(list: string): { valid: string[]; invalid: string[] } {
		const valid = [] as string[],
			invalid = [] as string[];

		const emails = list
			.split(',')
			.map((email) => email.trim())
			.filter((email) => email !== '');
		emails.forEach((email) => {
			const parsed = emailAddresses.parseOneAddress(email);
			if (parsed && (parsed as ParsedMailbox).address) {
				valid.push((parsed as ParsedMailbox).address);
			} else {
				invalid.push(email);
			}
		});
		return { valid, invalid };
	}

	private validateTemplate(template: string): void {
		try {
			const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(['./templates']));
			env.renderString(template, {});
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Template validation failed: ${error.message}`);
			} else {
				throw new Error('Template validation failed with an unknown error');
			}
		}
	}

	private validateSender(sender: string): void {
		const exp = /^[^<>]+<[^<>]+@[^<>]+\.[^<>]+>$/;
		if (!exp.test(sender)) {
			throw new Error('Invalid sender format. Expected "Name <email@example.com>"');
		}
	}

	private createAttachmentPayload(attachments: AttachmentInput[]): { formData: FormData; usedFields: string[] } {
		const formData = new FormData();
		const usedFields: string[] = [];
		for (const attachment of attachments) {
			if (!attachment?.path) {
				throw new Error('Attachment path is required');
			}
			const raw = fs.readFileSync(attachment.path);
			const filename = attachment.filename || path.basename(attachment.path);
			const blob = new Blob([raw], attachment.contentType ? { type: attachment.contentType } : undefined);
			const field = attachment.field || 'attachment';
			formData.append(field, blob, filename);
			usedFields.push(field);
		}
		return { formData, usedFields };
	}

	private appendFields(formData: FormData, fields: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(fields)) {
			if (value === undefined || value === null) {
				continue;
			}
			if (typeof value === 'string') {
				formData.append(key, value);
			} else if (typeof value === 'number' || typeof value === 'boolean') {
				formData.append(key, String(value));
			} else {
				formData.append(key, JSON.stringify(value));
			}
		}
	}

	private async postFormData<T>(command: string, formData: FormData): Promise<T> {
		const url = `${this.baseURL}${command}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer apikey-${this.apiKey}`
			},
			body: formData
		});
		const j = await response.json();
		if (response.ok) {
			return j;
		}
		if (j && j.message) {
			throw new Error(`FETCH FAILED: ${response.status} ${j.message}`);
		}
		throw new Error(`FETCH FAILED: ${response.status} ${response.statusText}`);
	}

	async storeTemplate(td: templateData): Promise<unknown> {
		if (!td.template) {
			throw new Error('No template data provided');
		}
		this.validateTemplate(td.template);
		if (td.sender) {
			this.validateSender(td.sender);
		}
		return this.storeTxTemplate(td);
	}

	async sendTemplate(std: sendTemplateData): Promise<unknown> {
		if (!std.name || !std.rcpt) {
			throw new Error('Invalid request body; name/rcpt required');
		}

		return this.sendTxMessage(std);
	}

	async storeTxTemplate(td: templateData): Promise<unknown> {
		if (!td.template) {
			throw new Error('No template data provided');
		}
		this.validateTemplate(td.template);
		if (td.sender) {
			this.validateSender(td.sender);
		}
		return this.post('/api/v1/tx/template', td);
	}

	async sendTxMessage(std: sendTemplateData): Promise<unknown> {
		if (!std.name || !std.rcpt) {
			throw new Error('Invalid request body; name/rcpt required');
		}

		const { invalid } = this.validateEmails(std.rcpt);
		if (invalid.length > 0) {
			throw new Error('Invalid email address(es): ' + invalid.join(','));
		}

		// this.validateTemplate(template);

		const body = {
			name: std.name,
			rcpt: std.rcpt,
			domain: std.domain || '',
			locale: std.locale || '',
			vars: std.vars || {},
			replyTo: std.replyTo,
			headers: std.headers
		};
		// console.log(JSON.stringify(body, undefined, 2));
		if (std.attachments && std.attachments.length > 0) {
			if (std.headers) {
				throw new Error('Headers are not supported with attachment uploads');
			}
			const { formData } = this.createAttachmentPayload(std.attachments);
			this.appendFields(formData, {
				name: std.name,
				rcpt: std.rcpt,
				domain: std.domain || '',
				locale: std.locale || '',
				vars: JSON.stringify(std.vars || {}),
				replyTo: std.replyTo
			});
			return this.postFormData('/api/v1/tx/message', formData);
		}
		return this.post('/api/v1/tx/message', body);
	}

	async storeFormTemplate(data: formTemplateData): Promise<unknown> {
		if (!data.template) {
			throw new Error('No template data provided');
		}
		if (!data.idname) {
			throw new Error('Missing form identifier');
		}
		if (!data.sender) {
			throw new Error('Missing sender address');
		}
		if (!data.recipient) {
			throw new Error('Missing recipient address');
		}
		this.validateTemplate(data.template);
		this.validateSender(data.sender);
		return this.post('/api/v1/form/template', data);
	}

	async sendFormMessage(data: sendFormData): Promise<unknown> {
		if (!data._mm_form_key) {
			throw new Error('Invalid request body; _mm_form_key required');
		}

		const fields: Record<string, unknown> = data.fields || {};
		const baseFields: Record<string, unknown> = {
			_mm_form_key: data._mm_form_key,
			_mm_locale: data._mm_locale,
			_mm_recipients: data._mm_recipients,
			...fields
		};

		if (data.attachments && data.attachments.length > 0) {
			const normalized = data.attachments.map((attachment, idx) => {
				const field = attachment.field || `_mm_file${idx + 1}`;
				if (!field.startsWith('_mm_file')) {
					throw new Error('Form attachments must use multipart field names starting with _mm_file');
				}
				return { ...attachment, field };
			});
			const { formData } = this.createAttachmentPayload(normalized);
			this.appendFields(formData, {
				_mm_form_key: data._mm_form_key,
				_mm_locale: data._mm_locale,
				_mm_recipients: data._mm_recipients
			});
			this.appendFields(formData, fields);
			return this.postFormData('/api/v1/form/message', formData);
		}

		return this.post('/api/v1/form/message', baseFields);
	}

	async uploadAssets(data: uploadAssetsData): Promise<unknown> {
		if (!data.domain) {
			throw new Error('domain is required');
		}
		if (!data.files || data.files.length === 0) {
			throw new Error('At least one asset file is required');
		}
		if (data.templateType && !data.template) {
			throw new Error('template is required when templateType is provided');
		}
		if (data.template && !data.templateType) {
			throw new Error('templateType is required when template is provided');
		}

		const attachments = data.files.map((input) => {
			if (typeof input === 'string') {
				return { path: input, field: 'asset' };
			}
			return { ...input, field: input.field || 'asset' };
		});

		const { formData } = this.createAttachmentPayload(attachments);
		this.appendFields(formData, {
			domain: data.domain,
			templateType: data.templateType,
			template: data.template,
			locale: data.locale,
			path: data.path
		});

		return this.postFormData('/api/v1/assets', formData);
	}
}

export default templateClient;
