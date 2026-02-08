import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';

import { api_form } from '../src/models/form.js';
import { api_txmail } from '../src/models/txmail.js';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('mail-magic API', () => {
	let ctx: TestContext | null = null;
	let api: ReturnType<typeof request>;

	beforeAll(async () => {
		ctx = await createTestContext();
		api = request((ctx.server as unknown as { app: unknown }).app);
	});

	afterAll(async () => {
		if (ctx) {
			await ctx.cleanup();
		}
	});

	beforeEach(() => {
		ctx?.smtp.reset();
	});

	test('loads transactional templates with hierarchy and assets', async () => {
		const template = await api_txmail.findOne({ where: { name: 'welcome' } });
		expect(template).toBeTruthy();
		if (!template) {
			return;
		}

		expect(template.template).toContain('<title>{{ title }}</title>');
		expect(template.template).toContain('<h1>{{ heading }}</h1>');
		expect(template.template).toContain('cid:images/logo.png');

		const expectedUrl = `${ctx.apiUrl}/asset/${ctx.domainName}/files/banner.png`;
		expect(template.template).toContain(expectedUrl);

		const inline = template.files.find((file) => file.filename === 'images/logo.png');
		const external = template.files.find((file) => file.filename === 'files/banner.png');

		expect(inline?.cid).toBe('images/logo.png');
		expect(external?.cid).toBeUndefined();
	});

	test('loads form templates with hierarchy and asset rewrites', async () => {
		const form = await api_form.findOne({ where: { idname: 'contact' } });
		expect(form).toBeTruthy();
		if (!form) {
			return;
		}

		expect(form.template).toContain('Name: {{ _fields_.name }}');
		expect(form.template).toContain('Email: {{ _fields_.email }}');
		expect(form.template).toContain('cid:images/logo.png');
	});

	test('serves assets from the public route and blocks traversal', async () => {
		const assetPath = `/asset/${ctx.domainName}/files/banner.png`;
		const res = await api.get(assetPath);
		expect(res.status).toBe(200);
		expect(res.headers['cache-control']).toContain('max-age=300');
		expect(res.headers['content-type']).toContain('image/png');
		expect(res.body.toString()).toBe('banner-bytes');

		const bad = await api.get(`/asset/${ctx.domainName}/%2e%2e/secret.txt`);
		expect(bad.status).toBe(404);
	});

	test('responds to ping', async () => {
		const res = await api.get('/api/v1/ping');
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
	});

	test('stores templates via the API', async () => {
		const res = await api.post('/api/v1/tx/template').set('Authorization', `Bearer apikey-${ctx.userToken}`).send({
			name: 'custom',
			domain: ctx.domainName,
			sender: 'sender@example.test',
			subject: 'Custom',
			template: '<p>Custom {{ name }}</p>'
		});

		expect(res.status).toBe(200);

		const stored = await api_txmail.findOne({ where: { name: 'custom' } });
		expect(stored?.template).toContain('Custom');
	});

	test('sends transactional mail with inline assets and attachments', async () => {
		const uploadsDir = ctx.uploadsPath;
		const beforeUploads = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
		const res = await api
			.post('/api/v1/tx/message')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.field('name', 'welcome')
			.field('domain', ctx.domainName)
			.field('rcpt', 'recipient@example.test')
			.field('vars', JSON.stringify({ title: 'Hello', heading: 'Mail Magic', name: 'Jane' }))
			.attach('file1', ctx.uploadFile);

		expect(res.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(message.subject).toBe('Welcome!');
		expect(html).toContain('Mail Magic');
		expect(html).toContain('Hello Jane');

		const filenames = message.attachments.map((att) => att.filename ?? '');
		expect(filenames.some((name) => name.endsWith('logo.png'))).toBe(true);
		expect(filenames.some((name) => name.endsWith('banner.png'))).toBe(true);
		expect(filenames).toContain('upload.txt');
		const inline = message.attachments.find((att) => att.contentId?.includes('images/logo.png'));
		expect(inline).toBeTruthy();

		expect(fs.existsSync(uploadsDir)).toBe(true);
		const afterUploads = fs.readdirSync(uploadsDir);
		const newUploads = afterUploads.filter((name) => !beforeUploads.includes(name));
		expect(newUploads.length).toBeGreaterThan(0);
		const uploadedPath = path.join(uploadsDir, newUploads[0]);
		expect(fs.readFileSync(uploadedPath, 'utf8')).toBe('upload-bytes');

		const stagingDir = path.join(ctx.configPath, '_uploads');
		if (fs.existsSync(stagingDir)) {
			expect(fs.existsSync(path.join(stagingDir, newUploads[0]))).toBe(false);
		}
	});

	test('requires _mm_form_key for public form submissions', async () => {
		const res = await api.post('/api/v1/form/message').send({
			name: 'Ada',
			email: 'ada@example.test'
		});

		expect(res.status).toBe(400);
	});

	test('accepts form submissions and delivers mail', async () => {
		const res = await api
			.post('/api/v1/form/message')
			.set('x-forwarded-for', '203.0.113.10')
			.field('_mm_form_key', ctx!.contactFormKey)
			.field('name', 'Ada')
			.field('email', 'ada@example.test')
			.attach('_mm_file1', ctx.uploadFile);

		expect(res.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(message.subject).toBe('Contact');
		expect(html).toContain('Name: Ada');
		expect(html).toContain('Email: ada@example.test');
		expect(html).toContain('IP: 203.0.113.10');

		const replyTo = message.replyTo?.value?.[0];
		expect(replyTo?.address).toBe('ada@example.test');
		expect(replyTo?.name).toBe('Ada');

		const filenames = message.attachments.map((att) => att.filename ?? '');
		expect(filenames).toContain('upload.txt');
	});

	test('allows public recipient selection by idname (with optional display name)', async () => {
		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'journalist-contact',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Journalist Contact',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;
		expect(typeof form_key).toBe('string');
		expect(form_key.length).toBeGreaterThan(0);

		const rcptRes = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				form_key,
				idname: 'alice',
				email: 'Alice Author <alice@example.test>'
			});
		expect(rcptRes.status).toBe(200);

		const sendRes = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			_mm_recipients: ['alice'],
			msg: 'world'
		});
		expect(sendRes.status).toBe(200);

		const message = await ctx!.smtp.waitForMessage();
		const to = message.to?.value?.[0];
		expect(to?.address).toBe('alice@example.test');
		expect(to?.name).toBe('Alice Author');

		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('Hello world');
	});

	test('falls back to domain-wide recipient mapping when no form-specific mapping exists', async () => {
		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'domainwide-fallback',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Domainwide Fallback',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;

		const rcptRes = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'desk',
				email: 'Desk <desk@example.test>'
			});
		expect(rcptRes.status).toBe(200);
		expect(rcptRes.body.data.form_key).toBe('');

		const sendRes = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			_mm_recipients: ['desk'],
			msg: 'hi'
		});
		expect(sendRes.status).toBe(200);

		const message = await ctx!.smtp.waitForMessage();
		const to = message.to?.value?.[0];
		expect(to?.address).toBe('desk@example.test');
		expect(to?.name).toBe('Desk');
	});

	test('prefers form-scoped recipient mapping over domain-wide mapping', async () => {
		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'override-precedence',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Override Precedence',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;

		const domainWide = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'editor',
				email: 'domainwide@example.test'
			});
		expect(domainWide.status).toBe(200);

		const formScoped = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				form_key,
				idname: 'editor',
				email: 'formspecific@example.test'
			});
		expect(formScoped.status).toBe(200);

		const sendRes = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			_mm_recipients: ['editor'],
			msg: 'ping'
		});
		expect(sendRes.status).toBe(200);

		const message = await ctx!.smtp.waitForMessage();
		const to = message.to?.value?.[0];
		expect(to?.address).toBe('formspecific@example.test');
	});

	test('rejects unknown recipient idnames on public form submission', async () => {
		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'unknown-recipient',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Unknown Recipient',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;

		const sendRes = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			_mm_recipients: ['does-not-exist'],
			msg: 'hello'
		});
		expect(sendRes.status).toBe(404);
	});

	test('supports recipient upsert via formid + locale (and rejects ambiguous formid without locale)', async () => {
		const enRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'localized-form',
				locale: 'en',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Localized Form',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		const frRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'localized-form',
				locale: 'fr',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Localized Form',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});

		expect(enRes.status).toBe(200);
		expect(frRes.status).toBe(200);
		const enFormKey = enRes.body.data.form_key as string;

		const ambiguous = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				formid: 'localized-form',
				idname: 'writer',
				email: 'writer@example.test'
			});
		expect(ambiguous.status).toBe(409);

		const rcptRes = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				formid: 'localized-form',
				locale: 'en',
				idname: 'writer',
				email: 'Writer <writer@example.test>'
			});
		expect(rcptRes.status).toBe(200);
		expect(rcptRes.body.data.form_key).toBe(enFormKey);

		const sendRes = await api.post('/api/v1/form/message').send({
			_mm_form_key: enFormKey,
			_mm_recipients: ['writer'],
			msg: 'hello'
		});
		expect(sendRes.status).toBe(200);

		const message = await ctx!.smtp.waitForMessage();
		const to = message.to?.value?.[0];
		expect(to?.address).toBe('writer@example.test');
		expect(to?.name).toBe('Writer');
	});

	test('validates recipient upserts (auth, ownership, inputs, and form_key scoping)', async () => {
		const missingAuth = await api.post('/api/v1/form/recipient').send({
			domain: ctx!.domainName,
			idname: 'x',
			email: 'x@example.test'
		});
		expect(missingAuth.status).toBe(401);

		const wrongOwner = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.otherDomainName,
				idname: 'x',
				email: 'x@example.test'
			});
		expect(wrongOwner.status).toBe(403);

		const badEmail = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'bad-email',
				email: 'not-an-email'
			});
		expect(badEmail.status).toBe(400);

		const badName = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'bad-name',
				email: 'valid@example.test',
				name: 'Bad\nName'
			});
		expect(badName.status).toBe(400);

		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx!.userToken}`)
			.send({
				domain: ctx!.domainName,
				idname: 'scoping-form',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'Scoping Form',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});
		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;

		const wrongDomainFormKey = await api
			.post('/api/v1/form/recipient')
			.set('Authorization', `Bearer apikey-${ctx!.otherUserToken}`)
			.send({
				domain: ctx!.otherDomainName,
				form_key,
				idname: 'desk',
				email: 'desk@example.test'
			});
		expect(wrongDomainFormKey.status).toBe(404);
	});
});
