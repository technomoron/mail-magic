import fs from 'node:fs';
import path from 'node:path';

import { api_form } from '../../packages/mail-magic/src/models/form.js';
import { api_txmail } from '../../packages/mail-magic/src/models/txmail.js';
import { createIntegrationContext } from '../helpers/integration-setup.js';

import type { IntegrationContext } from '../helpers/integration-setup.js';

type InitUser = {
	user_id: number;
	idname: string;
	token: string;
	email: string;
	domain: number;
	locale: string;
};

type InitDomain = {
	domain_id: number;
	user_id: number;
	name: string;
	sender: string;
	locale: string;
};

type InitTemplate = {
	template_id: number;
	user_id: number;
	domain_id: number;
	name: string;
	locale: string;
	sender: string;
	subject: string;
};

type InitForm = {
	form_id: number;
	user_id: number;
	domain_id: number;
	locale: string;
	idname: string;
	sender: string;
	recipient: string;
	subject: string;
	secret: string;
};

type InitData = {
	user: InitUser[];
	domain: InitDomain[];
	template: InitTemplate[];
	form: InitForm[];
};

function loadInitData(configPath: string): InitData {
	const initPath = path.join(configPath, 'init-data.json');
	return JSON.parse(fs.readFileSync(initPath, 'utf8')) as InitData;
}

function langChoice(locale: string | undefined, en: string, nb: string) {
	if (locale && String(locale).startsWith('nb')) {
		return nb;
	}
	return en;
}

function baseUrlForDomain(domainName: string) {
	return `https://app.${domainName}`;
}

function buildTxVars(name: string, domainName: string, locale: string) {
	const base = baseUrlForDomain(domainName);
	const vars: Record<string, string> = {
		first_name: langChoice(locale, 'Sam', 'Sander'),
		preferences_url: `${base}/preferences`,
		unsubscribe_url: `${base}/unsubscribe`
	};

	switch (name) {
		case 'register':
			vars.confirmation_url = `${base}/activate?token=example`;
			vars.expires_in = langChoice(locale, '24 hours', '24 timer');
			break;
		case 'welcome':
			vars.cta_url = `${base}/dashboard`;
			vars.plan = langChoice(locale, 'Growth', 'Vekst');
			break;
		case 'pwreset':
			vars.reset_url = `${base}/reset-password?token=example`;
			vars.expires_in = langChoice(locale, '60 minutes', '60 minutter');
			break;
		case 'magiclink':
			vars.magic_link = `${base}/magic-login?token=example`;
			vars.expires_in = langChoice(locale, '15 minutes', '15 minutter');
			break;
		default:
			break;
	}

	return vars;
}

function buildFormFields(idname: string, locale: string) {
	if (idname === 'contact') {
		return {
			name: langChoice(locale, 'Sam Testerson', 'Sander Testson'),
			email: 'qa@example.test',
			message: langChoice(locale, 'Hello from contact form', 'Hei fra kontaktskjema')
		};
	}

	return {
		campaign_name: langChoice(locale, 'Launch Q2', 'Lansering Q2'),
		source: 'landing-page',
		budget: '45000',
		message: langChoice(locale, 'Generic submission message', 'Generisk innsending')
	};
}

function subjectMatches(expected: string, actual: string | undefined) {
	if (!expected) {
		return true;
	}
	if (!actual) {
		return false;
	}
	return actual.includes(expected);
}

describe('mail-magic integration', () => {
	let ctx: IntegrationContext;
	let initData: InitData;
	let domainsById: Map<number, InitDomain>;
	let usersById: Map<number, InitUser>;

	beforeAll(async () => {
		ctx = await createIntegrationContext();
		initData = loadInitData(ctx.configPath);
		domainsById = new Map(initData.domain.map((domain) => [domain.domain_id, domain]));
		usersById = new Map(initData.user.map((user) => [user.user_id, user]));
	});

	afterAll(async () => {
		await ctx.cleanup();
	});

	beforeEach(() => {
		ctx.smtp.reset();
	});

	test('imports all templates and forms with inline and linked assets', async () => {
		const templates = await api_txmail.findAll();
		const forms = await api_form.findAll();

		expect(templates).toHaveLength(initData.template.length);
		expect(forms).toHaveLength(initData.form.length);

		for (const template of templates) {
			const domain = domainsById.get(template.domain_id);
			expect(domain).toBeTruthy();
			if (!domain) {
				continue;
			}
			const assetUrl = `${ctx.baseUrl}/api/asset/${domain.name}/files/banner.png`;
			expect(template.template).toContain('cid:images/logo.png');
			expect(template.template).toContain('cid:images/wordmark.png');
			expect(template.template).toContain(assetUrl);
			expect(template.files.some((file) => file.cid)).toBe(true);
			expect(template.files.some((file) => !file.cid)).toBe(true);
		}

		for (const form of forms) {
			const domain = domainsById.get(form.domain_id);
			expect(domain).toBeTruthy();
			if (!domain) {
				continue;
			}
			const assetUrl = `${ctx.baseUrl}/api/asset/${domain.name}/files/banner.png`;
			expect(form.template).toContain('cid:images/logo.png');
			expect(form.template).toContain(assetUrl);
			expect(form.files.some((file) => file.cid)).toBe(true);
			expect(form.files.some((file) => !file.cid)).toBe(true);
		}
	});

	test('serves assets for each domain and blocks traversal', async () => {
		for (const domain of initData.domain) {
			const res = await ctx.api.get(`/api/asset/${domain.name}/files/banner.png`);
			expect(res.status).toBe(200);
			expect(res.headers['content-type']).toContain('image/png');
			expect(res.body.toString().trim()).toContain(domain.name);
		}

		const bad = await ctx.api.get(`/api/asset/${ctx.domainAlpha}/%2e%2e/secret.txt`);
		expect(bad.status).toBe(404);
	});

	test('rejects template updates for the wrong domain token', async () => {
		const txRes = await ctx.api.post('/api/v1/tx/template').set('Authorization', 'Bearer apikey-beta-token').send({
			domain: ctx.domainAlpha,
			name: 'denied',
			sender: 'Alpha <noreply@alpha.example.test>',
			subject: 'Denied',
			template: '<p>Denied</p>'
		});

		expect(txRes.status).toBe(403);

		const formRes = await ctx.api
			.post('/api/v1/form/template')
			.set('Authorization', 'Bearer apikey-beta-token')
			.send({
				domain: ctx.domainAlpha,
				idname: 'denied-form',
				sender: 'Alpha Forms <forms@alpha.example.test>',
				recipient: 'owner@alpha.example.test',
				subject: 'Denied',
				template: '<p>Denied</p>'
			});

		expect(formRes.status).toBe(403);
	});

	test('requires form secret when configured', async () => {
		const res = await ctx.api.post('/api/v1/form/message').field('name', 'Sam').field('email', 'sam@example.test');

		// Public form submissions require `_mm_form_key` (no legacy domain/formid/secret inputs).
		expect(res.status).toBe(400);
	});

	test('client can store and send a transactional template', async () => {
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

	test('stores a form template via API and delivers it', async () => {
		const createRes = await ctx.api
			.post('/api/v1/form/template')
			.set('Authorization', 'Bearer apikey-alpha-token')
			.send({
				domain: ctx.domainAlpha,
				idname: 'client-form',
				sender: 'Alpha Forms <forms@alpha.example.test>',
				recipient: 'owner@alpha.example.test',
				subject: 'Client form subject',
				template: '<p>Client form {{ _fields_.name }}</p>',
				secret: 'client-secret'
			});

		expect(createRes.status).toBe(200);
		const formKey = String((createRes.body as { data?: { form_key?: unknown } })?.data?.form_key ?? '').trim();
		expect(formKey.length).toBeGreaterThan(0);

		const sendRes = await ctx.api.post('/api/v1/form/message').field('_mm_form_key', formKey).field('name', 'Ada');

		expect(sendRes.status).toBe(200);

		const message = await ctx.smtp.waitForMessage();
		expect(message.subject).toContain('Client form subject');
		const html = typeof message.html === 'string' ? message.html : String(message.html ?? '');
		expect(html).toContain('Client form Ada');
	});

	test('uploads assets to domain and template directories', async () => {
		const domainAsset = path.join(ctx.tempDir, 'asset-domain.txt');
		const templateAsset = path.join(ctx.tempDir, 'asset-template.txt');
		fs.writeFileSync(domainAsset, 'domain asset');
		fs.writeFileSync(templateAsset, 'template asset');

		const domainRes = await ctx.api
			.post('/api/v1/assets')
			.set('Authorization', 'Bearer apikey-alpha-token')
			.field('domain', ctx.domainAlpha)
			.attach('asset', domainAsset);

		expect(domainRes.status).toBe(200);

		const domainDest = path.join(ctx.configPath, ctx.domainAlpha, 'assets', 'asset-domain.txt');
		expect(fs.existsSync(domainDest)).toBe(true);

		const templateRes = await ctx.api
			.post('/api/v1/assets')
			.set('Authorization', 'Bearer apikey-alpha-token')
			.field('domain', ctx.domainAlpha)
			.field('templateType', 'tx')
			.field('template', 'welcome')
			.field('locale', 'en')
			.attach('asset', templateAsset);

		expect(templateRes.status).toBe(200);

		const templateDest = path.join(ctx.configPath, ctx.domainAlpha, 'tx-template', 'en', 'asset-template.txt');
		expect(fs.existsSync(templateDest)).toBe(true);
	});

	test('sends all transactional messages and form messages', async () => {
		const expectedSubjects = new Set<string>();
		for (const entry of initData.template) {
			expectedSubjects.add(entry.subject);
			const domain = domainsById.get(entry.domain_id);
			const user = usersById.get(entry.user_id) || usersById.get(domain?.user_id ?? -1);
			if (!domain || !user) {
				throw new Error(`Missing domain/user for template ${entry.name}`);
			}

			const vars = buildTxVars(entry.name, domain.name, entry.locale);
			const request = ctx.api
				.post('/api/v1/tx/message')
				.set('Authorization', `Bearer apikey-${user.token}`)
				.field('domain', domain.name)
				.field('name', entry.name)
				.field('locale', entry.locale)
				.field('rcpt', 'mailtrap@example.test')
				.field('vars', JSON.stringify(vars));

			if (entry.name === 'register' && entry.locale === 'en' && domain.name === ctx.domainAlpha) {
				request.attach('attachment', ctx.attachmentPath);
			}

			const res = await request;
			if (res.status >= 400) {
				throw new Error(`Failed to send tx ${entry.name} (${domain.name}/${entry.locale}): ${res.status}`);
			}
		}

		for (const entry of initData.form) {
			expectedSubjects.add(entry.subject);

			const domain = domainsById.get(entry.domain_id);
			if (!domain) {
				throw new Error(`Missing domain for form ${entry.idname}`);
			}

			const dbForm = await api_form.findByPk(entry.form_id);
			const formKey = String(dbForm?.form_key ?? '').trim();
			if (!formKey) {
				throw new Error(`Missing form_key for form ${entry.idname}`);
			}

			const fields = buildFormFields(entry.idname, entry.locale);
			const request = ctx.api
				.post('/api/v1/form/message')
				.set('x-forwarded-for', '203.0.113.10')
				.field('_mm_form_key', formKey)
				.field('_mm_locale', entry.locale);

			for (const [key, value] of Object.entries(fields)) {
				request.field(key, value);
			}

			if (entry.idname === 'contact') {
				request.attach('_mm_file1', ctx.attachmentPath);
			}

			const res = await request;
			if (res.status >= 400) {
				throw new Error(`Failed to send form ${entry.idname}: ${res.status}`);
			}
		}

		const expectedCount = initData.template.length + initData.form.length;
		await ctx.smtp.waitForMessages(expectedCount, 15000);
		expect(ctx.smtp.messages.length).toBeGreaterThanOrEqual(expectedCount);

		const subjects = ctx.smtp.messages.map((msg) => msg.subject || '');
		const missing = Array.from(expectedSubjects).filter(
			(subject) => !subjects.some((actual) => subjectMatches(subject, actual))
		);
		if (missing.length) {
			throw new Error(`Missing expected subjects: ${missing.join(', ')}`);
		}

		const attachmentNames = ctx.smtp.messages.flatMap((message) =>
			(message.attachments || []).map((attachment) => attachment.filename || '')
		);

		expect(attachmentNames).toContain('images/logo.png');
		expect(attachmentNames).toContain('images/wordmark.png');
		expect(attachmentNames).toContain('files/banner.png');
		expect(attachmentNames).toContain('sample-attachment.txt');

		const hasInline = ctx.smtp.messages.some((message) =>
			(message.attachments || []).some((attachment) => attachment.contentId)
		);
		expect(hasInline).toBe(true);
	});
});
