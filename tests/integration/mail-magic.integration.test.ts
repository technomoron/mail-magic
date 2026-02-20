import fs from 'node:fs';
import path from 'node:path';

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

	test('serves assets for each domain and blocks traversal', async () => {
		for (const domain of initData.domain) {
			const owner = usersById.get(domain.user_id);
			expect(owner).toBeTruthy();
			if (!owner) {
				continue;
			}
			const client = owner.token === 'alpha-token' ? ctx.clients.alpha : ctx.clients.beta;
			const data = await client.fetchPublicAsset(domain.name, 'files/banner.png', true);
			expect(Buffer.from(data).toString().trim()).toContain(domain.name);
		}

		await expect(ctx.clients.alpha.fetchPublicAsset(ctx.domainAlpha, '../secret.txt', true)).rejects.toThrow(
			/FETCH FAILED/
		);
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
			const client = user.token === 'alpha-token' ? ctx.clients.alpha : ctx.clients.beta;
			try {
				await client.sendTxMessage({
					domain: domain.name,
					name: entry.name,
					locale: entry.locale,
					rcpt: 'mailtrap@example.test',
					vars,
					attachments:
						entry.name === 'register' && entry.locale === 'en' && domain.name === ctx.domainAlpha
							? [{ path: ctx.attachmentPath }]
							: undefined
				});
			} catch (err) {
				throw new Error(`Failed to send tx ${entry.name} (${domain.name}/${entry.locale}): ${String(err)}`);
			}
		}

		for (const entry of initData.form) {
			expectedSubjects.add(entry.subject);

			const domain = domainsById.get(entry.domain_id);
			if (!domain) {
				throw new Error(`Missing domain for form ${entry.idname}`);
			}
			const user = usersById.get(entry.user_id) || usersById.get(domain.user_id);
			if (!user) {
				throw new Error(`Missing user for form ${entry.idname}`);
			}
			const client = user.token === 'alpha-token' ? ctx.clients.alpha : ctx.clients.beta;

			const recipientResp = await client.storeFormRecipient({
				domain: domain.name,
				idname: entry.idname,
				formid: entry.idname,
				locale: entry.locale,
				email: entry.recipient,
				name: 'Integration Recipient'
			});
			const formKey = String(
				(recipientResp.data as { form_key?: unknown } | undefined)?.form_key ??
					(recipientResp as { form_key?: unknown }).form_key ??
					''
			).trim();
			if (!formKey) {
				throw new Error(`Missing form_key for form ${entry.idname}`);
			}

			const fields = buildFormFields(entry.idname, entry.locale);
			try {
				await client.sendFormMessage({
					_mm_form_key: formKey,
					_mm_locale: entry.locale,
					fields,
					attachments: entry.idname === 'contact' ? [{ path: ctx.attachmentPath }] : undefined
				});
			} catch (err) {
				throw new Error(`Failed to send form ${entry.idname}: ${String(err)}`);
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
