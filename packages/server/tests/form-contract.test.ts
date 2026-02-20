import request from 'supertest';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('public form submission contract', () => {
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

	test('requires _mm_form_key', async () => {
		const res = await api.post('/api/v1/form/message').send({ msg: 'hello' });
		expect(res.status).toBe(400);
	});

	test('accepts _mm_form_key as the canonical input', async () => {
		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			email: 'ada@example.test',
			name: 'Ada'
		});
		expect(res.status).toBe(200);
	});

	test('rejects unknown _mm_* fields', async () => {
		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			_mm_wrong: 'nope',
			email: 'ada@example.test'
		});
		expect(res.status).toBe(400);
	});

	test('rejects legacy lookup fields (domain/formid/secret)', async () => {
		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			domain: ctx!.domainName,
			formid: 'contact',
			secret: 'nope'
		});
		expect(res.status).toBe(200);
	});

	test('rejects legacy recipient override fields (recipient/recipient_idname)', async () => {
		const emailOverride = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			recipient: 'attacker@example.test'
		});
		expect(emailOverride.status).toBe(200);

		const idOverride = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			recipient_idname: 'alice'
		});
		expect(idOverride.status).toBe(200);
	});

	test('rejects provider-specific captcha field names (must use captcha_token)', async () => {
		const res = await api.post('/api/v1/form/message').send({
			_mm_form_key: ctx!.contactFormKey,
			'cf-turnstile-response': 'token'
		});
		expect(res.status).toBe(200);
	});
});
