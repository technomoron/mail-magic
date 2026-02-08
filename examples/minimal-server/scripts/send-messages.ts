import TemplateClient from '../../../packages/mail-magic-client/src/mail-magic-client.ts';

type Mode = 'tx' | 'form' | 'both';

const baseUrl = process.env.MM_BASE_URL || 'http://127.0.0.1:3776';
const token = process.env.MM_TOKEN || 'example-token';
const domain = process.env.MM_DOMAIN || 'example.test';

const txName = process.env.MM_TX_NAME || 'welcome';
const formId = process.env.MM_FORM_ID || 'contact';
const locale = process.env.MM_LOCALE || 'en';

const rcpt = process.env.MM_RCPT || 'user@example.test';
const sender = process.env.MM_SENDER || 'Example <noreply@example.test>';
const formSender = process.env.MM_FORM_SENDER || 'Example Forms <forms@example.test>';
const formRecipient = process.env.MM_FORM_RECIPIENT || 'owner@example.test';
const formSecret = process.env.MM_FORM_SECRET || 'form-secret';

type ApiEnvelope<T> = {
	success: boolean;
	code: number;
	message?: string;
	data: T;
	errors?: Record<string, unknown>;
};

type FormTemplateUpsertData = {
	Status: string;
	created: boolean;
	form_key: string;
};

async function postJson(url: string, body: Record<string, unknown>): Promise<void> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const msg = (await res.text().catch(() => res.statusText)) || res.statusText;
		throw new Error(`Request failed: ${res.status} ${msg}`);
	}
}

const modeArg = (process.argv[2] || 'both') as Mode;
const mode: Mode = modeArg === 'tx' || modeArg === 'form' ? modeArg : 'both';

async function sendTx(client: TemplateClient): Promise<void> {
	await client.storeTxTemplate({
		domain,
		name: txName,
		sender,
		subject: 'Welcome from mail-magic',
		locale,
		template: '<p>Hello {{ name }}!</p>'
	});

	await client.sendTxMessage({
		domain,
		name: txName,
		locale,
		rcpt,
		vars: { name: 'Example' }
	});

	console.log(`Sent tx template '${txName}' to ${rcpt}`);
}

async function sendForm(client: TemplateClient): Promise<void> {
	const stored = (await client.storeFormTemplate({
		domain,
		idname: formId,
		sender: formSender,
		recipient: formRecipient,
		subject: 'Example form submission',
		locale,
		secret: formSecret,
		template: '<p>Contact from {{ _fields_.name }} ({{ _fields_.email }})</p>'
	})) as ApiEnvelope<FormTemplateUpsertData>;

	const form_key = String(stored?.data?.form_key ?? '').trim();
	if (!form_key) {
		throw new Error('Expected data.form_key in the form template response');
	}

	// Public form submission endpoint (no auth): requires `_mm_form_key`.
	await postJson(`${baseUrl}/api/v1/form/message`, {
		_mm_form_key: form_key,
		name: 'Example User',
		email: rcpt,
		message: 'Hello from the example script.'
	});

	console.log(`Sent form message '${formId}' to ${formRecipient}`);
}

async function main(): Promise<void> {
	const client = new TemplateClient(baseUrl, token);
	if (mode === 'tx') {
		await sendTx(client);
		return;
	}
	if (mode === 'form') {
		await sendForm(client);
		return;
	}
	await sendTx(client);
	await sendForm(client);
}

main().catch((err: unknown) => {
	console.error('Error:', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
