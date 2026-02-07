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
	await client.storeFormTemplate({
		domain,
		idname: formId,
		sender: formSender,
		recipient: formRecipient,
		subject: 'Example form submission',
		locale,
		secret: formSecret,
		template: '<p>Contact from {{ _fields_.name }} ({{ _fields_.email }})</p>'
	});

	await client.sendFormMessage({
		domain,
		formid: formId,
		secret: formSecret,
		fields: {
			name: 'Example User',
			email: rcpt,
			message: 'Hello from the example script.'
		}
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
