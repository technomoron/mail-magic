import { ApiRequest } from '@technomoron/api-server-base';
import { api_form } from '../models/form.js';
import { api_recipient } from '../models/recipient.js';
import { ParsedFormSubmission } from './form-submission.js';
import type { api_domain } from '../models/domain.js';
import type { api_user } from '../models/user.js';
import type { RequestMeta, UploadedFile } from '../types.js';
export declare function parsePublicSubmissionOrThrow(apireq: ApiRequest): ParsedFormSubmission;
export declare function enforceAttachmentPolicy(env: {
    FORM_MAX_ATTACHMENTS: number;
}, rawFiles: UploadedFile[]): void;
export declare function filterSubmissionFields(rawFields: Record<string, unknown>, allowedFields: unknown): Record<string, unknown>;
export declare function enforceCaptchaPolicy(params: {
    vars: {
        FORM_CAPTCHA_REQUIRED: boolean;
        FORM_CAPTCHA_SECRET: string;
        FORM_CAPTCHA_PROVIDER: string;
    };
    form: {
        captcha_required: boolean;
    };
    captchaToken: string;
    clientIp: string;
}): Promise<void>;
export declare function buildReplyToValue(form: {
    replyto_email: string;
    replyto_from_fields: boolean;
}, fields: Record<string, unknown>): (string | {
    name: string;
    address: string;
}) | undefined;
export declare function parseIdnameList(value: unknown, field: string): string[];
export type FormRecipientPayload = {
    idnameRaw: string;
    emailRaw: string;
    nameRaw: string;
    formKeyRaw: string;
    formid: string;
    localeRaw: string;
};
export declare function parseRecipientPayload(body: Record<string, unknown>): FormRecipientPayload;
export declare function normalizeRecipientIdname(raw: string): string;
export declare function normalizeRecipientEmail(raw: string): {
    email: string;
    mailbox: {
        address: string;
        name?: string | null;
    };
};
export declare function normalizeRecipientName(raw: string, mailboxName?: string | null): string;
export declare function resolveFormKeyForRecipient(params: {
    formKeyRaw: string;
    formid: string;
    localeRaw: string;
    user: api_user;
    domain: api_domain;
}): Promise<string>;
export declare function parseAllowedFields(raw: unknown): string[];
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
export declare function parseFormTemplatePayload(body: Record<string, unknown>): FormTemplateInput;
export declare function validateFormTemplatePayload(payload: FormTemplateInput): void;
export declare function buildFormTemplatePaths(params: {
    user: api_user;
    domain: api_domain;
    idname: string;
    locale: string;
}): {
    localeSlug: string;
    slug: string;
    filename: string;
};
export declare function resolveFormKeyForTemplate(params: {
    user_id: number;
    domain_id: number;
    locale: string;
    idname: string;
}): Promise<string>;
export declare function buildFormTemplateRecord(params: {
    form_key: string;
    user_id: number;
    domain_id: number;
    locale: string;
    slug: string;
    filename: string;
    payload: FormTemplateInput;
}): {
    form_key: string;
    user_id: number;
    domain_id: number;
    locale: string;
    idname: string;
    sender: string;
    recipient: string;
    subject: string;
    template: string;
    slug: string;
    filename: string;
    secret: string;
    replyto_email: string;
    replyto_from_fields: boolean;
    allowed_fields: string[];
    captcha_required: boolean;
    files: never[];
};
export declare function resolveRecipients(form: api_form, recipientsRaw: unknown): Promise<api_recipient[]>;
export declare function buildRecipientTo(form: api_form, recipients: api_recipient[]): string | (string | {
    name: string;
    address: string;
})[];
export declare function getPrimaryRecipientInfo(form: api_form, recipients: api_recipient[]): {
    rcptEmail: string;
    rcptName: string;
    rcptIdname: string;
    rcptIdnames: string[];
};
export declare function buildSubmissionContext(params: {
    form_key: string;
    localeRaw: string;
    recipients: string[];
    rcptEmail: string;
    rcptName: string;
    rcptIdname: string;
    rcptIdnames: string[];
    attachmentMap: Record<string, string>;
    fields: Record<string, unknown>;
    files: UploadedFile[];
    meta: RequestMeta;
}): Record<string, unknown>;
