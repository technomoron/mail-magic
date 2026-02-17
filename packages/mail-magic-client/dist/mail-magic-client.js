"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const email_addresses_1 = __importDefault(require("email-addresses"));
const nunjucks_1 = __importDefault(require("nunjucks"));
class templateClient {
    constructor(baseURL, apiKey) {
        this.baseURL = baseURL;
        this.apiKey = apiKey;
        if (!apiKey || !baseURL) {
            throw new Error('Apikey/api-url required');
        }
    }
    async request(method, command, body) {
        const url = `${this.baseURL}${command}`;
        const headers = {
            Accept: 'application/json',
            Authorization: `Bearer apikey-${this.apiKey}`
        };
        const options = {
            method,
            headers
        };
        // Avoid GET bodies (they're non-standard and can break under some proxies).
        if (method !== 'GET' && body !== undefined) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        const j = await response.json();
        if (response.ok) {
            return j;
        }
        if (j && j.message) {
            throw new Error(`FETCH FAILED: ${response.status} ${j.message}`);
        }
        else {
            throw new Error(`FETCH FAILED: ${response.status} ${response.statusText}`);
        }
    }
    async get(command) {
        return this.request('GET', command);
    }
    async post(command, body) {
        return this.request('POST', command, body);
    }
    async put(command, body) {
        return this.request('PUT', command, body);
    }
    async delete(command, body) {
        return this.request('DELETE', command, body);
    }
    validateEmails(list) {
        const valid = [], invalid = [];
        const emails = list
            .split(',')
            .map((email) => email.trim())
            .filter((email) => email !== '');
        emails.forEach((email) => {
            const parsed = email_addresses_1.default.parseOneAddress(email);
            if (parsed && parsed.address) {
                valid.push(parsed.address);
            }
            else {
                invalid.push(email);
            }
        });
        return { valid, invalid };
    }
    validateTemplate(template) {
        try {
            const env = new nunjucks_1.default.Environment(null, { autoescape: true });
            const compiled = nunjucks_1.default.compile(template, env);
            compiled.render({});
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Syntax validation should not require local template loaders.
            if (/template not found|no loader|unable to find template/i.test(message)) {
                return;
            }
            if (error instanceof Error) {
                throw new Error(`Template validation failed: ${error.message}`);
            }
            else {
                throw new Error('Template validation failed with an unknown error');
            }
        }
    }
    validateSender(sender) {
        const exp = /^[^<>]+<[^<>]+@[^<>]+\.[^<>]+>$/;
        if (!exp.test(sender)) {
            throw new Error('Invalid sender format. Expected "Name <email@example.com>"');
        }
    }
    createAttachmentPayload(attachments) {
        const formData = new FormData();
        const usedFields = [];
        for (const attachment of attachments) {
            if (!attachment?.path) {
                throw new Error('Attachment path is required');
            }
            const raw = fs_1.default.readFileSync(attachment.path);
            const filename = attachment.filename || path_1.default.basename(attachment.path);
            const blob = new Blob([raw], attachment.contentType ? { type: attachment.contentType } : undefined);
            const field = attachment.field || 'attachment';
            formData.append(field, blob, filename);
            usedFields.push(field);
        }
        return { formData, usedFields };
    }
    appendFields(formData, fields) {
        for (const [key, value] of Object.entries(fields)) {
            if (value === undefined || value === null) {
                continue;
            }
            if (typeof value === 'string') {
                formData.append(key, value);
            }
            else if (typeof value === 'number' || typeof value === 'boolean') {
                formData.append(key, String(value));
            }
            else {
                formData.append(key, JSON.stringify(value));
            }
        }
    }
    async postFormData(command, formData) {
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
    async storeTemplate(td) {
        // Backward-compatible alias for transactional template storage.
        return this.storeTxTemplate(td);
    }
    async sendTemplate(std) {
        if (!std.name || !std.rcpt) {
            throw new Error('Invalid request body; name/rcpt required');
        }
        return this.sendTxMessage(std);
    }
    async storeTxTemplate(td) {
        if (!td.template) {
            throw new Error('No template data provided');
        }
        this.validateTemplate(td.template);
        if (td.sender) {
            this.validateSender(td.sender);
        }
        return this.post('/api/v1/tx/template', td);
    }
    async sendTxMessage(std) {
        if (!std.name || !std.rcpt) {
            throw new Error('Invalid request body; name/rcpt required');
        }
        const { invalid } = this.validateEmails(std.rcpt);
        if (invalid.length > 0) {
            throw new Error('Invalid email address(es): ' + invalid.join(','));
        }
        const body = {
            name: std.name,
            rcpt: std.rcpt,
            domain: std.domain || '',
            locale: std.locale || '',
            vars: std.vars || {},
            replyTo: std.replyTo,
            headers: std.headers
        };
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
    async storeFormTemplate(data) {
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
    async storeFormRecipient(data) {
        if (!data.domain) {
            throw new Error('Missing domain');
        }
        if (!data.idname) {
            throw new Error('Missing recipient identifier');
        }
        if (!data.email) {
            throw new Error('Missing recipient email');
        }
        const parsed = email_addresses_1.default.parseOneAddress(data.email);
        if (!parsed || !parsed.address) {
            throw new Error('Invalid recipient email address');
        }
        return this.post('/api/v1/form/recipient', data);
    }
    async sendFormMessage(data) {
        if (!data._mm_form_key) {
            throw new Error('Invalid request body; _mm_form_key required');
        }
        const fields = data.fields || {};
        const baseFields = {
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
    async uploadAssets(data) {
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
    async getSwaggerSpec() {
        return this.get('/api/swagger');
    }
    async fetchPublicAsset(domain, assetPath, viaApiBase = false) {
        if (!domain) {
            throw new Error('domain is required');
        }
        if (!assetPath) {
            throw new Error('assetPath is required');
        }
        const cleanedPath = assetPath
            .split('/')
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/');
        if (!cleanedPath) {
            throw new Error('assetPath is required');
        }
        const prefix = viaApiBase ? '/api/asset' : '/asset';
        const url = `${this.baseURL}${prefix}/${encodeURIComponent(domain)}/${cleanedPath}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: '*/*'
            }
        });
        if (!response.ok) {
            throw new Error(`FETCH FAILED: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
    }
}
exports.default = templateClient;
