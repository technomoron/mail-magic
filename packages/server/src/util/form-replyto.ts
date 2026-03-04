import emailAddresses from 'email-addresses';

import { getBodyValue } from './utils.js';

type ReplyToValue = string | { name: string; address: string };

function sanitizeHeaderValue(value: string, maxLen: number): string {
	const trimmed = String(value ?? '').trim();
	if (!trimmed) {
		return '';
	}
	// Prevent header injection.
	if (/[\r\n]/.test(trimmed)) {
		return '';
	}
	return trimmed.slice(0, maxLen);
}

export function extractReplyToFromSubmission(body: Record<string, unknown>): ReplyToValue | undefined {
	const emailRaw = sanitizeHeaderValue(getBodyValue(body, 'email'), 320);
	if (!emailRaw) {
		return undefined;
	}

	const parsed = emailAddresses.parseOneAddress(emailRaw);
	if (!parsed) {
		return undefined;
	}

	const address = sanitizeHeaderValue((parsed as { address?: unknown })?.address as string, 320);
	if (!address) {
		return undefined;
	}

	// Prefer a single "name" field, otherwise compose from first_name/last_name.
	let name = sanitizeHeaderValue(getBodyValue(body, 'name'), 200);
	if (!name) {
		const first = sanitizeHeaderValue(getBodyValue(body, 'first_name'), 100);
		const last = sanitizeHeaderValue(getBodyValue(body, 'last_name'), 100);
		name = sanitizeHeaderValue(`${first}${first && last ? ' ' : ''}${last}`, 200);
	}

	return name ? { name, address } : address;
}
