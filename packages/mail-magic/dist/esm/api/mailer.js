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
        const { template, sender = '', name, subject = '', locale = '' } = apireq.req.body;
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
        const { name, rcpt, domain = '', locale = '', vars = {}, replyTo, reply_to, headers } = apireq.req.body;
        await assert_domain_and_user(apireq);
        if (!name || !rcpt || !domain) {
            throw new ApiError({ code: 400, message: 'name/rcpt/domain required' });
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
        try {
            template =
                (await api_txmail.findOne({ where: { name, domain_id, locale } })) ||
                    (await api_txmail.findOne({ where: { name, domain_id, locale: '' } }));
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
                message: `Template "${name}" not found for any locale in domain "${domain}"`
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
                path: file.path
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
                    subject: template.subject || apireq.req.body.subject || '',
                    html,
                    text,
                    attachments,
                    ...(normalizedReplyTo ? { replyTo: normalizedReplyTo } : {}),
                    ...(normalizedHeaders ? { headers: normalizedHeaders } : {})
                };
                await this.server.storage.transport.sendMail(sendargs);
            }
            return [200, { Status: 'OK', Message: 'Emails sent successfully' }];
        }
        catch (error) {
            throw new ApiError({
                code: 500,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
    defineRoutes() {
        return [
            {
                method: 'post',
                path: '/v1/tx/message',
                handler: this.post_send.bind(this),
                auth: { type: 'yes', req: 'any' }
            },
            {
                method: 'post',
                path: '/v1/tx/template',
                handler: this.post_template.bind(this),
                auth: { type: 'yes', req: 'any' }
            }
        ];
    }
}
