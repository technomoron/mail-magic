import request from 'supertest';

import { api_domain } from '../src/models/domain.js';
import { api_form } from '../src/models/form.js';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('form lookup and recipient override rules', () => {
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

	test('returns 409 when domain + formid is ambiguous across multiple domain rows', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}

		const otherDomainId = 99;
		await api_domain.create({
			domain_id: otherDomainId,
			user_id: 2,
			name: ctx.domainName,
			sender: 'Other Sender <other@example.test>',
			locale: '',
			is_default: false
		});

		await api_form.create({
			form_id: 99,
			form_key: 'other-tenant-contact-form',
			user_id: 2,
			domain_id: otherDomainId,
			locale: '',
			idname: 'contact',
			sender: 'otherforms@example.test',
			recipient: 'otherowner@example.test',
			subject: 'Other Contact',
			template: '<p>Other</p>',
			filename: '',
			slug: '',
			secret: '',
			captcha_required: false,
			files: []
		});

		const res = await api.post('/api/v1/form/message').send({
			domain: ctx.domainName,
			formid: 'contact',
			name: 'Ada',
			email: 'ada@example.test'
		});

		expect(res.status).toBe(409);
	});

	test('rejects public recipient overrides when the form has no secret', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}

		const templateRes = await api
			.post('/api/v1/form/template')
			.set('Authorization', `Bearer apikey-${ctx.userToken}`)
			.send({
				domain: ctx.domainName,
				idname: 'no-secret-override',
				sender: 'forms@example.test',
				recipient: 'default@example.test',
				subject: 'No Secret',
				template: '<p>Hello {{ _fields_.msg }}</p>'
			});
		expect(templateRes.status).toBe(200);
		const form_key = templateRes.body.data.form_key as string;

		const res = await api.post('/api/v1/form/message').send({
			form_key,
			recipient: 'attacker@example.test',
			msg: 'hello'
		});

		expect(res.status).toBe(401);
	});
});
