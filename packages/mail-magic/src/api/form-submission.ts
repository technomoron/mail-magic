import { z } from 'zod';

const ALLOWED_MM_KEYS = new Set<string>(['_mm_form_key', '_mm_locale', '_mm_recipients']);

function asRecord(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return {};
	}
	return input as Record<string, unknown>;
}

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

function getCaptchaTokenFromBody(body: Record<string, unknown>): string {
	return getBodyValue(body, 'cf-turnstile-response', 'h-captcha-response', 'g-recaptcha-response', 'captcha');
}

const optionalStringish = z.union([z.string(), z.array(z.string())]).optional();

// Public form submission payload schema.
// - Validates/normalizes system fields under the `_mm_*` namespace.
// - Allows arbitrary non-system fields through (exposed to templates as `_fields_`).
// - Rejects unknown `_mm_*` keys (except `_mm_file*` attachment field names).
export const form_submission_schema = z
	.object({
		_mm_form_key: z
			.string()
			.min(1)
			.describe('Required. Public form key identifying which form configuration to use.'),
		_mm_locale: z
			.string()
			.optional()
			.default('')
			.describe('Optional locale hint used when rendering and for recipient resolution.'),
		_mm_recipients: z
			.union([z.string(), z.array(z.string())])
			.optional()
			.describe(
				'Optional list of recipient idnames (array) or comma-separated string. Recipients are resolved server-side.'
			),

		// Common fields used to derive Reply-To (optional; no defaults).
		email: optionalStringish.describe('Optional submitter email used to derive Reply-To.'),
		name: optionalStringish.describe('Optional submitter name used to derive Reply-To.'),
		first_name: optionalStringish.describe('Optional submitter first name used to derive Reply-To.'),
		last_name: optionalStringish.describe('Optional submitter last name used to derive Reply-To.'),

		// Provider-native CAPTCHA token field names (accepted as-is; not part of the `_mm_*` namespace).
		'cf-turnstile-response': optionalStringish.describe('Cloudflare Turnstile token (accepted as-is).'),
		'h-captcha-response': optionalStringish.describe('hCaptcha token (accepted as-is).'),
		'g-recaptcha-response': optionalStringish.describe('Google reCAPTCHA token (accepted as-is).'),
		captcha: optionalStringish.describe('Generic/legacy captcha token field (accepted as-is).')
	})
	.passthrough()
	.superRefine((obj, ctx) => {
		for (const key of Object.keys(obj)) {
			if (!key.startsWith('_mm_')) {
				continue;
			}
			if (key.startsWith('_mm_file')) {
				// Files arrive in req.files, but allow clients to pass harmless metadata fields.
				continue;
			}
			if (!ALLOWED_MM_KEYS.has(key)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Unknown system field "${key}"`
				});
			}
		}
	})
	.describe(
		'Public form submission payload. System fields must be `_mm_*`. All other fields are treated as user fields and exposed to templates as `_fields_`.'
	);

export type ParsedFormSubmission = {
	mm: {
		form_key: string;
		locale: string;
		captcha_token: string;
		recipients_raw: unknown;
	};
	fields: Record<string, unknown>;
};

export function parseFormSubmissionInput(raw: unknown): ParsedFormSubmission {
	const body = asRecord(raw);

	// Enforce that system params are _mm_* only (except provider captcha fields).
	// We intentionally do not accept non-_mm aliases for system params.
	const mm_form_key = getBodyValue(body, '_mm_form_key');
	const mm_locale = getBodyValue(body, '_mm_locale');
	const mm_recipients = body._mm_recipients;
	const mm_captcha_token = getCaptchaTokenFromBody(body);

	const parsed = form_submission_schema.parse({
		...body,
		_mm_form_key: mm_form_key,
		_mm_locale: mm_locale,
		_mm_recipients: mm_recipients
	});
	const { _mm_form_key, _mm_locale, _mm_recipients, ...rest } = parsed;

	// Expose non-system fields to templates. Keep all non-`_mm_*` keys verbatim.
	const fields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(rest)) {
		if (key.startsWith('_mm_')) {
			continue;
		}
		fields[key] = value;
	}

	return {
		mm: {
			form_key: _mm_form_key,
			locale: _mm_locale,
			captcha_token: mm_captcha_token,
			recipients_raw: _mm_recipients
		},
		fields
	};
}
