import request from 'supertest';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('form captcha verification', () => {
	let ctx: TestContext | null = null;
	let api: ReturnType<typeof request>;
	let form_key = '';

	beforeAll(async () => {
		ctx = await createTestContext();
		api = request((ctx.server as unknown as { app: unknown }).app);

		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				idname: 'captcha-form',
				sender: 'forms@example.test',
				recipient: 'owner@example.test',
				subject: 'Captcha Form',
				captcha_required: true,
				template: '<p>Captcha {{ _fields_.msg }}</p>'
			});

		expect(templateRes.status).toBe(200);
		form_key = String(templateRes.body?.data?.form_key ?? '');
		expect(form_key).toBeTruthy();
	});

	afterAll(async () => {
		if (ctx) {
			await ctx.cleanup();
		}
	});

	beforeEach(() => {
		ctx?.smtp.reset();
		vi.unstubAllGlobals();
		if (ctx) {
			ctx.store.env.FORM_CAPTCHA_PROVIDER = 'turnstile';
			ctx.store.env.FORM_CAPTCHA_REQUIRED = false;
			ctx.store.env.FORM_CAPTCHA_SECRET = '';
		}
	});

	test('returns 500 when captcha_required is set but FORM_CAPTCHA_SECRET is missing', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_CAPTCHA_SECRET = '';

		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			msg: 'hello'
		});
		expect(res.status).toBe(500);
	});

	test('requires a captcha token when captcha_required is enabled and secret is configured', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_CAPTCHA_SECRET = 'captcha-secret';

		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			msg: 'hello'
		});
		expect(res.status).toBe(403);
	});

	test('rejects invalid captcha tokens', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_CAPTCHA_SECRET = 'captcha-secret';

		const fetchSpy = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: false })
		})) as unknown as typeof fetch;
		vi.stubGlobal('fetch', fetchSpy);

		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			'cf-turnstile-response': 'bad-token',
			msg: 'hello'
		});
		expect(res.status).toBe(403);
		expect(fetchSpy).toHaveBeenCalled();
	});

	test('accepts valid captcha tokens', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_CAPTCHA_SECRET = 'captcha-secret';

		const fetchSpy = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true })
		})) as unknown as typeof fetch;
		vi.stubGlobal('fetch', fetchSpy);

		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: form_key,
			'cf-turnstile-response': 'good-token',
			msg: 'world'
		});
		expect(res.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalled();

		const message = await ctx.smtp.waitForMessage();
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('Captcha world');
	});
});
