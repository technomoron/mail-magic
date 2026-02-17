import { ApiModule, ApiError } from '@technomoron/api-server-base';
import { nanoid } from 'nanoid';
import nunjucks from 'nunjucks';
import { UniqueConstraintError } from 'sequelize';
import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';
import { buildFormTemplateRecord, buildFormTemplatePaths, buildRecipientTo, buildReplyToValue, buildSubmissionContext, enforceAttachmentPolicy, enforceCaptchaPolicy, filterSubmissionFields, getPrimaryRecipientInfo, normalizeRecipientEmail, normalizeRecipientIdname, normalizeRecipientName, parseIdnameList, parseFormTemplatePayload, parseRecipientPayload, parsePublicSubmissionOrThrow, resolveFormKeyForTemplate, resolveFormKeyForRecipient, resolveRecipients, validateFormTemplatePayload } from '../util/forms.js';
import { FixedWindowRateLimiter, enforceFormRateLimit } from '../util/ratelimit.js';
import { buildAttachments, cleanupUploadedFiles } from '../util/uploads.js';
import { buildRequestMeta, getBodyValue } from '../util.js';
import { assert_domain_and_user } from './auth.js';
export class FormAPI extends ApiModule {
    rateLimiter = new FixedWindowRateLimiter();
    async postFormRecipient(apireq) {
        await assert_domain_and_user(apireq);
        const body = (apireq.req.body ?? {});
        const payload = parseRecipientPayload({
            idname: getBodyValue(body, 'idname'),
            email: getBodyValue(body, 'email'),
            name: getBodyValue(body, 'name'),
            form_key: getBodyValue(body, 'form_key'),
            formid: getBodyValue(body, 'formid'),
            locale: getBodyValue(body, 'locale')
        });
        const idname = normalizeRecipientIdname(payload.idnameRaw);
        const { email, mailbox } = normalizeRecipientEmail(payload.emailRaw);
        const name = normalizeRecipientName(payload.nameRaw, mailbox.name);
        const user = apireq.user;
        const domain = apireq.domain;
        const form_key = await resolveFormKeyForRecipient({
            formKeyRaw: payload.formKeyRaw,
            formid: payload.formid,
            localeRaw: payload.localeRaw,
            user,
            domain
        });
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
        }
        catch (error) {
            throw new ApiError({
                code: 500,
                message: this.server.guessExceptionText(error, 'Unknown Sequelize Error on upsert recipient')
            });
        }
        return [200, { Status: 'OK', created, form_key }];
    }
    async postFormTemplate(apireq) {
        await assert_domain_and_user(apireq);
        const payload = parseFormTemplatePayload(apireq.req.body ?? {});
        validateFormTemplatePayload(payload);
        const user = apireq.user;
        const domain = apireq.domain;
        const resolvedLocale = payload.locale || apireq.locale || '';
        const { localeSlug, slug, filename } = buildFormTemplatePaths({
            user,
            domain,
            idname: payload.idname,
            locale: resolvedLocale
        });
        let form_key = (await resolveFormKeyForTemplate({
            user_id: user.user_id,
            domain_id: domain.domain_id,
            locale: localeSlug,
            idname: payload.idname
        })) || nanoid();
        const record = buildFormTemplateRecord({
            form_key,
            user_id: user.user_id,
            domain_id: domain.domain_id,
            locale: localeSlug,
            slug,
            filename,
            payload
        });
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
            }
            catch (error) {
                if (error instanceof UniqueConstraintError) {
                    const conflicted = error.errors?.some((e) => e.path === 'form_key');
                    if (conflicted) {
                        record.form_key = nanoid();
                        form_key = record.form_key;
                        continue;
                    }
                }
                throw new ApiError({
                    code: 500,
                    message: this.server.guessExceptionText(error, 'Unknown Sequelize Error on upsert form template')
                });
            }
        }
        return [200, { Status: 'OK', created, form_key }];
    }
    async postSendForm(apireq) {
        const env = this.server.storage.vars;
        const rawFiles = Array.isArray(apireq.req.files) ? apireq.req.files : [];
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
            // Attach inline template assets (cid:...) so clients can render embedded images reliably.
            // Linked assets (asset('...') without inline flag) are kept as URLs and are not attached here.
            const templateFiles = Array.isArray(form.files) ? form.files : [];
            const inlineTemplateAttachments = templateFiles
                .filter((file) => Boolean(file && file.cid))
                .map((file) => ({
                filename: file.filename,
                path: file.path,
                cid: file.cid
            }));
            const allAttachments = [...inlineTemplateAttachments, ...attachments];
            const meta = buildRequestMeta(apireq.req);
            const to = buildRecipientTo(form, resolvedRecipients);
            const replyToValue = buildReplyToValue(form, fields);
            const context = buildSubmissionContext({
                form_key,
                localeRaw,
                recipients,
                rcptEmail,
                rcptName,
                rcptIdname,
                rcptIdnames,
                attachmentMap,
                fields,
                files: rawFiles,
                meta
            });
            nunjucks.configure({ autoescape: this.server.storage.vars.AUTOESCAPE_HTML });
            const html = nunjucks.renderString(form.template, context);
            const mailOptions = {
                from: form.sender,
                to,
                subject: form.subject,
                html,
                attachments: allAttachments,
                ...(replyToValue ? { replyTo: replyToValue } : {})
            };
            try {
                const info = await this.server.storage.transport.sendMail(mailOptions);
                this.server.storage.print_debug('Email sent: ' + info.response);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.server.storage.print_debug('Error sending email: ' + errorMessage);
                throw new ApiError({ code: 500, message: `Error sending email: ${errorMessage}` });
            }
            return [200, {}];
        }
        finally {
            if (!keepUploads) {
                await cleanupUploadedFiles(rawFiles);
            }
        }
    }
    defineRoutes() {
        return [
            {
                method: 'post',
                path: '/v1/form/recipient',
                handler: (req) => this.postFormRecipient(req),
                auth: { type: 'yes', req: 'any' }
            },
            {
                method: 'post',
                path: '/v1/form/template',
                handler: (req) => this.postFormTemplate(req),
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
