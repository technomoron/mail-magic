import TemplateClient from '../../../packages/client/src/mail-magic-client.ts';

const baseUrl = 'http://127.0.0.1:3776';
const token = 'example-token';
const domain = 'example.test';

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

function extractApiMessage(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') {
		return undefined;
	}
	const message = (payload as { message?: unknown }).message;
	if (typeof message === 'string' && message.trim()) {
		return message.trim();
	}
	return undefined;
}

async function postJson<T>(
	url: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {}
): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...headers
		},
		body: JSON.stringify(body)
	});

	const json = (await res.json().catch(() => null)) as unknown;
	if (!res.ok) {
		const message = extractApiMessage(json) || res.statusText;
		throw new Error(`Request failed: ${res.status} ${message}`);
	}
	return json as T;
}

async function main(): Promise<void> {
	const client = new TemplateClient(baseUrl, token);

	// Store a form template (authenticated). Capture `form_key` for public submissions.
	const stored = (await client.storeFormTemplate({
		domain,
		idname: 'journalist-contact',
		sender: 'Example Forms <forms@example.test>',
		recipient: 'default@example.test',
		subject: 'Journalist Contact',
		template: '<p>Hello {{ _fields_.msg }}</p>'
	})) as ApiEnvelope<FormTemplateUpsertData>;

	const form_key = String(stored?.data?.form_key ?? '');
	if (!form_key) {
		throw new Error('Expected data.form_key in the form template response');
	}

	// Configure recipient allowlist (authenticated).
	await postJson(
		`${baseUrl}/api/v1/form/recipient`,
		{
			domain,
			form_key,
			idname: 'desk',
			email: 'News Desk <desk@example.test>'
		},
		{
			Authorization: `Bearer apikey-${token}`
		}
	);

	// Submit the form publicly (no auth required).
	await postJson(`${baseUrl}/api/v1/form/message`, {
		_mm_form_key: form_key,
		_mm_recipients: ['desk'],
		msg: 'Hello from the public form example'
	});

	console.log('Created/updated form: journalist-contact');
	console.log(`Public form_key: ${form_key}`);
}

main().catch((err: unknown) => {
	console.error('Error:', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
