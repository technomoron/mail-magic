import { ApiModule, ApiError } from '@technomoron/api-server-base';
import { convert } from 'html-to-text';
import nunjucks from 'nunjucks';
import { api_txmail } from '../models/txmail.js';
import { validateEmail } from '../util/email.js';
import { buildRequestMeta } from '../util.js';
import { assert_domain_and_user } from './auth.js';
export class MailerAPI extends ApiModule {
    //
    // Validate a set of email addresses. Return arrays of invalid
    // and valid email addresses.
    //
    validateEmails(list) {
        const valid = [];
        const invalid = [];
        const emails = list
            .split(',')
            .map((email) => email.trim())
            .filter((email) => email !== '');
        for (const email of emails) {
            const addr = validateEmail(email);
            if (addr) {
                valid.push(addr);
            }
            else {
                invalid.push(email);
            }
        }
        return { valid, invalid };
    }
    // Store a template in the database
    async post_template(apireq) {
        await assert_domain_and_user(apireq);
        const body = apireq.req.body;
        const template = String(body.template ?? '');
        const sender = String(body.sender ?? '');
        const name = String(body.name ?? '');
        const subject = String(body.subject ?? '');
        const locale = String(body.locale ?? '');
        if (!template) {
            throw new ApiError({ code: 400, message: 'Missing template data' });
        }
        if (!name) {
            throw new ApiError({ code: 400, message: 'Missing template name' });
        }
        const data = {
            user_id: apireq.user.user_id,
            domain_id: apireq.domain.domain_id,
            name,
            subject,
            locale,
            sender,
            template
        };
        try {
            const [templateRecord, created] = await api_txmail.upsert(data, {
                returning: true
            });
            this.server.storage.print_debug(`Template upserted: ${templateRecord.name} (created=${created})`);
        }
        catch (error) {
            throw new ApiError({
                code: 500,
                message: this.server.guessExceptionText(error, 'Unknown Sequelize Error on upsert template')
            });
        }
        return [200, { Status: 'OK' }];
    }
    // Send a template using posted arguments.
    async post_send(apireq) {
        const body = apireq.req.body;
        const name = String(body.name ?? '');
        const rcpt = String(body.rcpt ?? '');
        const locale = String(body.locale ?? '');
        const vars = body.vars ?? {};
        const replyTo = body.replyTo;
        const reply_to = body.reply_to;
        const headers = body.headers;
        await assert_domain_and_user(apireq);
        if (!name || !rcpt) {
            throw new ApiError({ code: 400, message: 'name/rcpt required' });
        }
        let parsedVars = vars ?? {};
        if (typeof vars === 'string') {
            try {
                parsedVars = JSON.parse(vars);
            }
            catch {
                throw new ApiError({ code: 400, message: 'Invalid JSON provided in "vars"' });
            }
        }
        const thevars = parsedVars;
        const { valid, invalid } = this.validateEmails(rcpt);
        if (invalid.length > 0) {
            throw new ApiError({ code: 400, message: 'Invalid email address(es): ' + invalid.join(',') });
        }
        let template = null;
        const domain_id = apireq.domain.domain_id;
        const deflocale = apireq.domain.locale || '';
        try {
            // 1. Exact locale match
            template = await api_txmail.findOne({ where: { name, domain_id, locale } });
            // 2. Domain/user default locale (if different from request locale)
            if (!template && deflocale && deflocale !== locale) {
                template = await api_txmail.findOne({ where: { name, domain_id, locale: deflocale } });
            }
            // 3. Empty-locale fallback (if not already tried above)
            if (!template && locale !== '') {
                template = await api_txmail.findOne({ where: { name, domain_id, locale: '' } });
            }
        }
        catch (error) {
            throw new ApiError({
                code: 500,
                message: this.server.guessExceptionText(error, 'Unknown Sequelize Error')
            });
        }
        if (!template) {
            throw new ApiError({
                code: 404,
                message: `Template "${name}" not found for any locale in domain "${apireq.domain.name}"`
            });
        }
        const sender = template.sender || apireq.domain.sender || apireq.user.email;
        if (!sender) {
            throw new ApiError({ code: 500, message: `Unable to locate sender for ${template.name}` });
        }
        const rawFiles = Array.isArray(apireq.req.files) ? apireq.req.files : [];
        await this.server.storage.relocateUploads(apireq.domain?.name ?? null, rawFiles);
        const templateAssets = Array.isArray(template.files) ? template.files : [];
        const attachments = [
            ...templateAssets.map((file) => ({
                filename: file.filename,
                path: file.path,
                cid: file.cid
            })),
            ...rawFiles.map((file) => ({
                filename: file.originalname,
                ...(file.buffer ? { content: file.buffer } : { path: file.filepath })
            }))
        ];
        const attachmentMap = {};
        for (const file of rawFiles) {
            attachmentMap[file.fieldname] = file.originalname;
        }
        this.server.storage.print_debug(`Template vars keys: ${Object.keys(thevars).join(', ')}`);
        const meta = buildRequestMeta(apireq.req);
        const replyToValue = (replyTo || reply_to);
        let normalizedReplyTo;
        if (replyToValue) {
            normalizedReplyTo = validateEmail(replyToValue);
            if (!normalizedReplyTo) {
                throw new ApiError({ code: 400, message: 'Invalid reply-to email address' });
            }
        }
        const ALLOWED_CUSTOM_HEADERS = new Set([
            'x-mailer',
            'x-priority',
            'x-entity-ref-id',
            'list-unsubscribe',
            'list-unsubscribe-post',
            'list-id',
            'precedence',
            'references',
            'in-reply-to',
            'message-id',
            'importance'
        ]);
        let normalizedHeaders;
        if (headers !== undefined) {
            if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
                throw new ApiError({ code: 400, message: 'headers must be a key/value object' });
            }
            normalizedHeaders = {};
            for (const [key, value] of Object.entries(headers)) {
                if (typeof value !== 'string') {
                    throw new ApiError({ code: 400, message: `headers.${key} must be a string` });
                }
                if (!ALLOWED_CUSTOM_HEADERS.has(key.toLowerCase())) {
                    throw new ApiError({ code: 400, message: `Header "${key}" is not allowed` });
                }
                normalizedHeaders[key] = value;
            }
        }
        try {
            const env = new nunjucks.Environment(null, { autoescape: this.server.storage.vars.AUTOESCAPE_HTML });
            const compiled = nunjucks.compile(template.template, env);
            for (const recipient of valid) {
                const fullargs = {
                    ...thevars,
                    _rcpt_email_: recipient,
                    _attachments_: attachmentMap,
                    _vars_: thevars,
                    _meta_: meta
                };
                const html = await compiled.render(fullargs);
                const text = convert(html);
                const sendargs = {
                    from: sender,
                    to: recipient,
                    subject: template.subject || body.subject || '',
                    html,
                    text,
                    attachments,
                    ...(normalizedReplyTo ? { replyTo: normalizedReplyTo } : {}),
                    ...(normalizedHeaders ? { headers: normalizedHeaders } : {})
                };
                if (!this.server.storage.transport) {
                    throw new ApiError({ code: 503, message: 'Mail transport is not available' });
                }
                await this.server.storage.transport.sendMail(sendargs);
            }
            return [200, { Status: 'OK', Message: 'Emails sent successfully' }];
        }
        catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError({
                code: 500,
                message: 'Failed to render or send email'
            });
        }
    }
    defineRoutes() {
        return [
            {
                method: 'post',
                path: '/v1/tx/message',
                handler: this.post_send.bind(this),
                // No schema: this route accepts multipart/form-data; Fastify validates request.body
                // before the multipart parsing hook populates it, so schema required-fields would
                // reject valid multipart requests. Validation is handled in the route handler.
                auth: { type: 'yes', req: 'any' }
            },
            {
                method: 'post',
                path: '/v1/tx/template',
                handler: this.post_template.bind(this),
                auth: { type: 'yes', req: 'any' },
                schema: {
                    body: {
                        type: 'object',
                        required: ['name', 'template'],
                        properties: {
                            name: { type: 'string' },
                            template: { type: 'string' },
                            sender: { type: 'string' },
                            subject: { type: 'string' },
                            locale: { type: 'string' }
                        },
                        additionalProperties: true
                    }
                }
            }
        ];
    }
}
