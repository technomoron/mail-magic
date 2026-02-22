import { z } from 'zod';
export declare const form_submission_schema: z.ZodObject<{
    _mm_form_key: z.ZodString;
    _mm_locale: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    _mm_recipients: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    email: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    name: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    first_name: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    last_name: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    'cf-turnstile-response': z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    'h-captcha-response': z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    'g-recaptcha-response': z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    captcha: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
}, z.core.$loose>;
export type ParsedFormSubmission = {
    mm: {
        form_key: string;
        locale: string;
        captcha_token: string;
        recipients_raw: unknown;
    };
    fields: Record<string, unknown>;
};
export declare function parseFormSubmissionInput(raw: unknown): ParsedFormSubmission;
