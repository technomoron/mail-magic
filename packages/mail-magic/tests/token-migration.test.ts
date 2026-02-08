import request from 'supertest';

import { api_domain } from '../src/models/domain.js';
import { apiTokenToHmac, api_user } from '../src/models/user.js';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('API token HMAC migration', () => {
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

	test('auth accepts legacy plaintext token and migrates it to token_hmac', async () => {
		if (!ctx) {
			throw new Error('missing test context');
		}

		const legacyToken = 'legacy-token';
		const pepper = ctx.store.env.API_TOKEN_PEPPER;
		const expectedHmac = apiTokenToHmac(legacyToken, pepper);

		await api_user.create({
			user_id: 99,
			idname: 'legacy',
			token: legacyToken,
			token_hmac: null,
			name: 'Legacy User',
			email: 'legacy@example.test',
			domain: null,
			locale: ''
		});

		await api_domain.create({
			domain_id: 99,
			user_id: 99,
			name: 'legacy.test',
			sender: 'Legacy <legacy@example.test>',
			locale: '',
			is_default: true
		});

		const first = await api.post('/api/v1/tx/template').set('Authorization', `Bearer apikey-${legacyToken}`).send({
			domain: 'legacy.test',
			name: 'first',
			sender: 'legacy@example.test',
			subject: 'Hello',
			template: '<p>Hello</p>'
		});
		expect(first.status).toBe(200);

		const migrated = await api_user.findByPk(99);
		expect(migrated).toBeTruthy();
		expect(migrated?.token).toBe('');
		expect(migrated?.token_hmac).toBe(expectedHmac);

		const second = await api.post('/api/v1/tx/template').set('Authorization', `Bearer apikey-${legacyToken}`).send({
			domain: 'legacy.test',
			name: 'second',
			sender: 'legacy@example.test',
			subject: 'Hello',
			template: '<p>Hello</p>'
		});
		expect(second.status).toBe(200);
	});
});
