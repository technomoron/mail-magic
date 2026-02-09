import emailAddresses, { ParsedMailbox } from 'email-addresses';

export function validateEmail(email: string): string | undefined {
	const parsed = emailAddresses.parseOneAddress(email);
	if (parsed) {
		return (parsed as ParsedMailbox).address;
	}
	return undefined;
}

export function parseMailbox(value: string): ParsedMailbox | undefined {
	const parsed = emailAddresses.parseOneAddress(value);
	if (!parsed) {
		return undefined;
	}
	const mailbox = parsed as ParsedMailbox;
	if (!mailbox?.address) {
		return undefined;
	}
	return mailbox;
}
