# @technomoron/mail-magic-client

Typed client library for the mail-magic server.

## Install

```bash
npm install @technomoron/mail-magic-client
```

## Client Usage

```ts
import TemplateClient from '@technomoron/mail-magic-client';

// Use the server origin (no /api).
const baseUrl = 'http://127.0.0.1:3776';

// This is the user token from init-data.json / the admin API.
const token = 'example-token';

const client = new TemplateClient(baseUrl, token);

await client.storeTxTemplate({
	domain: 'example.test',
	name: 'welcome',
	sender: 'App <noreply@example.test>',
	subject: 'Welcome',
	template: '<p>Hello {{ name }}</p>'
});

await client.sendTxMessage({
	domain: 'example.test',
	name: 'welcome',
	rcpt: 'user@example.test',
	vars: { name: 'Sam' }
});
```

## Forms

Store/update a form template (authenticated). The response includes `data.form_key`, a stable random identifier (nanoid)
that is preferred for public form submissions:

```ts
const res = await client.storeFormTemplate({
	domain: 'example.test',
	idname: 'contact',
	sender: 'Example Forms <forms@example.test>',
	recipient: 'owner@example.test',
	subject: 'New contact form submission',
	secret: 's3cret',
	template: '<p>Hello {{ _fields_.name }}</p>'
});

const form_key = res.data.form_key;
```

Store/update form recipient mappings (authenticated):

```ts
await client.storeFormRecipient({
	domain: 'example.test',
	idname: 'support',
	email: 'Support <support@example.test>',
	name: 'Support Team',
	formid: 'contact',
	locale: 'en'
});
```

Submit a form publicly (no auth required):

```ts
await fetch(`${baseUrl}/api/v1/form/message`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		_mm_form_key: form_key,
		name: 'Sam',
		email: 'sam@example.test',
		message: 'Hello from the website'
	})
});
```

If you want to use the client helper (`sendFormMessage()`), pass `_mm_form_key` (public form key):

```ts
await client.sendFormMessage({
	_mm_form_key: form_key,
	fields: { name: 'Sam', email: 'sam@example.test', message: 'Hello' }
});
```

## CLI

The CLI is now a separate package: `@technomoron/mail-magic-cli`.

## Notes

- OpenAPI spec (when enabled): `await client.getSwaggerSpec()`
- Public asset fetch helpers:
    - `await client.fetchPublicAsset('example.test', 'images/logo.png')` -> `/asset/{domain}/{path}`
    - `await client.fetchPublicAsset('example.test', 'images/logo.png', true)` -> `/api/asset/{domain}/{path}`
