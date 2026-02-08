import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('form anti-abuse controls', () => {
	let ctx: TestContext | null = null;
	let api: ReturnType<typeof request>;

	let baseline: {
		formMaxAttachments: number;
		formKeepUploads: boolean;
		formRateLimitWindowSec: number;
		formRateLimitMax: number;
	} | null = null;

	beforeAll(async () => {
		ctx = await createTestContext();
		api = request((ctx.server as unknown as { app: unknown }).app);
		baseline = {
			formMaxAttachments: ctx.store.env.FORM_MAX_ATTACHMENTS,
			formKeepUploads: ctx.store.env.FORM_KEEP_UPLOADS,
			formRateLimitWindowSec: ctx.store.env.FORM_RATE_LIMIT_WINDOW_SEC,
			formRateLimitMax: ctx.store.env.FORM_RATE_LIMIT_MAX
		};
	});

	afterAll(async () => {
		if (ctx) {
			await ctx.cleanup();
		}
	});

	beforeEach(() => {
		ctx?.smtp.reset();
		if (ctx && baseline) {
			ctx.store.env.FORM_MAX_ATTACHMENTS = baseline.formMaxAttachments;
			ctx.store.env.FORM_KEEP_UPLOADS = baseline.formKeepUploads;
			ctx.store.env.FORM_RATE_LIMIT_WINDOW_SEC = baseline.formRateLimitWindowSec;
			ctx.store.env.FORM_RATE_LIMIT_MAX = baseline.formRateLimitMax;
		}
	});

	test('rate limits by client IP when configured', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_RATE_LIMIT_WINDOW_SEC = 60;
		ctx.store.env.FORM_RATE_LIMIT_MAX = 1;

		const first = await api.post('/api/v1/form/message').set('x-forwarded-for', '203.0.113.50').send({
			domain: ctx.domainName,
			formid: 'contact',
			secret: 's3cret',
			name: 'Ada',
			email: 'ada@example.test'
		});
		expect(first.status).toBe(200);
		await ctx.smtp.waitForMessage();

		const second = await api.post('/api/v1/form/message').set('x-forwarded-for', '203.0.113.50').send({
			domain: ctx.domainName,
			formid: 'contact',
			secret: 's3cret',
			name: 'Ada',
			email: 'ada@example.test'
		});
		expect(second.status).toBe(429);
		expect(String(second.headers['retry-after'] ?? '')).toMatch(/^\d+$/);
	});

	test('rejects form attachments when FORM_MAX_ATTACHMENTS=0', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_MAX_ATTACHMENTS = 0;

		const res = await api
			.post('/api/v1/form/message')
			.field('domain', ctx.domainName)
			.field('formid', 'contact')
			.field('secret', 's3cret')
			.field('name', 'Ada')
			.field('email', 'ada@example.test')
			.attach('file1', ctx.uploadFile);

		expect(res.status).toBe(413);
	});

	test('rejects too many form attachments when FORM_MAX_ATTACHMENTS is exceeded', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_MAX_ATTACHMENTS = 1;

		const res = await api
			.post('/api/v1/form/message')
			.field('domain', ctx.domainName)
			.field('formid', 'contact')
			.field('secret', 's3cret')
			.field('name', 'Ada')
			.field('email', 'ada@example.test')
			.attach('file1', ctx.uploadFile)
			.attach('file2', ctx.uploadFile);

		expect(res.status).toBe(413);
	});

	test('cleans up staged uploads when FORM_KEEP_UPLOADS=false', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}
		ctx.store.env.FORM_KEEP_UPLOADS = false;
		ctx.store.env.FORM_MAX_ATTACHMENTS = 0;

		const stagingDir = path.join(ctx.configPath, '_uploads');
		const before = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];

		const res = await api
			.post('/api/v1/form/message')
			.field('domain', ctx.domainName)
			.field('formid', 'contact')
			.field('secret', 's3cret')
			.field('name', 'Ada')
			.field('email', 'ada@example.test')
			.attach('file1', ctx.uploadFile);

		expect(res.status).toBe(413);

		const after = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];
		expect(after).toEqual(before);
	});
});
