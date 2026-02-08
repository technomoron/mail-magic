import request from 'supertest';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('nunjucks autoescape', () => {
	let ctx: TestContext | null = null;
	let api: ReturnType<typeof request>;
	let baselineAutoescape = true;

	beforeAll(async () => {
		ctx = await createTestContext();
		api = request((ctx.server as unknown as { app: unknown }).app);
		baselineAutoescape = ctx.store.env.AUTOESCAPE_HTML;
	});

	afterAll(async () => {
		if (ctx) {
			await ctx.cleanup();
		}
	});

	beforeEach(() => {
		ctx?.smtp.reset();
		if (ctx) {
			ctx.store.env.AUTOESCAPE_HTML = baselineAutoescape;
		}
	});

	test('escapes HTML by default', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.AUTOESCAPE_HTML = true;

		const storeRes = await api
			.post('/api/v1/tx/template')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-on',
				sender: 'sender@example.test',
				subject: 'Autoescape On',
				template: '<p>{{ user_html }}</p>'
			});
		expect(storeRes.status).toBe(200);

		const sendRes = await api
			.post('/api/v1/tx/message')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-on',
				rcpt: 'recipient@example.test',
				vars: { user_html: '<b>bold</b>' }
			});
		expect(sendRes.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
	});

	test('supports the standard nunjucks |safe filter', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.AUTOESCAPE_HTML = true;

		const storeRes = await api
			.post('/api/v1/tx/template')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-safe',
				sender: 'sender@example.test',
				subject: 'Autoescape Safe',
				template: '<p>{{ user_html | safe }}</p>'
			});
		expect(storeRes.status).toBe(200);

		const sendRes = await api
			.post('/api/v1/tx/message')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-safe',
				rcpt: 'recipient@example.test',
				vars: { user_html: '<b>bold</b>' }
			});
		expect(sendRes.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('<b>bold</b>');
	});

	test('can disable autoescape via AUTOESCAPE_HTML', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.AUTOESCAPE_HTML = false;

		const storeRes = await api
			.post('/api/v1/tx/template')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-off',
				sender: 'sender@example.test',
				subject: 'Autoescape Off',
				template: '<p>{{ user_html }}</p>'
			});
		expect(storeRes.status).toBe(200);

		const sendRes = await api
			.post('/api/v1/tx/message')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				name: 'autoescape-off',
				rcpt: 'recipient@example.test',
				vars: { user_html: '<b>bold</b>' }
			});
		expect(sendRes.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('<b>bold</b>');
	});
});
