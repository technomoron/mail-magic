import request from 'supertest';

import { api_txmail } from '../src/models/txmail.js';

import { createTestContext } from './helpers/test-setup.js';

import type { TestContext } from './helpers/test-setup.js';

describe('asset base overrides', () => {
	let ctx: TestContext | null = null;
	let api: ReturnType<typeof request>;

	beforeAll(async () => {
		ctx = await createTestContext({ assetPublicBase: 'https://cdn.example.test' });
		api = request((ctx.server as unknown as { app: unknown }).app);
	});

	afterAll(async () => {
		if (ctx) {
			await ctx.cleanup();
		}
	});

	test('uses ASSET_PUBLIC_BASE when rewriting asset URLs', async () => {
		const template = await api_txmail.findOne({ where: { name: 'welcome' } });
		expect(template).toBeTruthy();
		if (!template || !ctx) {
			return;
		}

		const expectedUrl = `https://cdn.example.test${ctx.assetRoute}/${ctx.domainName}/files/banner.png`;
		expect(template.template).toContain(expectedUrl);

		const res = await api.get(`${ctx.assetRoute}/${ctx.domainName}/files/banner.png`);
		expect(res.status).toBe(200);
	});
});
