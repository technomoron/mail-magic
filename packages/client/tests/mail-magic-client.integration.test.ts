import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, beforeEach, afterAll, describe, expect, test } from 'vitest';

import { createIntegrationContext } from '../../../tests/helpers/integration-setup.js';

import type { IntegrationContext } from '../../../tests/helpers/integration-setup.js';

describe('TemplateClient integration', () => {
	let ctx: IntegrationContext;

	beforeAll(async () => {
		ctx = await createIntegrationContext();
	});

	afterAll(async () => {
		await ctx.cleanup();
	});

	beforeEach(() => {
		ctx.smtp.reset();
	});

	test('stores and sends a transactional template through client methods', async () => {
		await ctx.clients.alpha.storeTemplate({
			domain: ctx.domainAlpha,
			name: 'client-template',
			sender: 'Alpha <noreply@alpha.example.test>',
			subject: 'Client Subject',
			template: '<p>Hello {{ name }}</p>'
		});

		await ctx.clients.alpha.sendTemplate({
			domain: ctx.domainAlpha,
			name: 'client-template',
			rcpt: 'client@example.test',
			vars: { name: 'Riley' }
		});

		const message = await ctx.smtp.waitForMessage();
		expect(message.subject).toContain('Client Subject');
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('Hello Riley');
	});

	test('stores a form template and submits a form message through client methods', async () => {
		const created = await ctx.clients.alpha.storeFormTemplate({
			domain: ctx.domainAlpha,
			idname: 'client-form',
			sender: 'Alpha Forms <forms@alpha.example.test>',
			recipient: 'owner@alpha.example.test',
			subject: 'Client form subject',
			template: '<p>Client form {{ _fields_.name }}</p>',
			secret: 'client-secret'
		});

		const formKey = String((created as { data?: { form_key?: unknown } }).data?.form_key ?? '').trim();
		expect(formKey.length).toBeGreaterThan(0);

		await ctx.clients.alpha.sendFormMessage({
			_mm_form_key: formKey,
			fields: { name: 'Ada' }
		});

		const message = await ctx.smtp.waitForMessage();
		expect(message.subject).toContain('Client form subject');
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('Client form Ada');
	});

	test('uploads domain and template assets through client methods', async () => {
		const domainAsset = path.join(ctx.tempDir, 'asset-domain.txt');
		const templateAsset = path.join(ctx.tempDir, 'asset-template.txt');
		fs.writeFileSync(domainAsset, 'domain asset');
		fs.writeFileSync(templateAsset, 'template asset');

		await ctx.clients.alpha.uploadAssets({
			domain: ctx.domainAlpha,
			files: [domainAsset]
		});

		const domainDest = path.join(ctx.configPath, ctx.domainAlpha, 'assets', 'asset-domain.txt');
		expect(fs.existsSync(domainDest)).toBe(true);

		await ctx.clients.alpha.uploadAssets({
			domain: ctx.domainAlpha,
			templateType: 'tx',
			template: 'welcome',
			locale: 'en',
			files: [templateAsset]
		});

		const templateDest = path.join(ctx.configPath, ctx.domainAlpha, 'tx-template', 'en', 'asset-template.txt');
		expect(fs.existsSync(templateDest)).toBe(true);
	});

	test('rejects domain updates when token does not belong to the target domain', async () => {
		await expect(
			ctx.clients.beta.storeTemplate({
				domain: ctx.domainAlpha,
				name: 'denied',
				sender: 'Alpha <noreply@alpha.example.test>',
				subject: 'Denied',
				template: '<p>Denied</p>'
			})
		).rejects.toThrow(/FETCH FAILED: 403/);
	});
});
