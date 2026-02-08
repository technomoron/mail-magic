import emailAddresses from 'email-addresses';

type ReplyToValue = string | { name: string; address: string };

function getFirstStringField(body: Record<string, unknown>, key: string): string {
	const value = body[key];
	if (Array.isArray(value) && value.length > 0) {
		return String(value[0] ?? '');
	}
	if (value !== undefined && value !== null) {
		return String(value);
	}
	return '';
}

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
	const emailRaw = sanitizeHeaderValue(getFirstStringField(body, 'email'), 320);
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
	let name = sanitizeHeaderValue(getFirstStringField(body, 'name'), 200);
	if (!name) {
		const first = sanitizeHeaderValue(getFirstStringField(body, 'first_name'), 100);
		const last = sanitizeHeaderValue(getFirstStringField(body, 'last_name'), 100);
		name = sanitizeHeaderValue(`${first}${first && last ? ' ' : ''}${last}`, 200);
	}

	return name ? { name, address } : address;
}
