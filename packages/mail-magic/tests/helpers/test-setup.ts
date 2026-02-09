import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

import { createMailMagicServer } from '../../src/index.js';

import type { mailApiServer } from '../../src/server.js';
import type { mailStore } from '../../src/store/store.js';
import type { ParsedMail } from 'mailparser';
import type { AddressInfo } from 'node:net';

type SmtpCapture = {
	server: SMTPServer;
	port: number;
	messages: ParsedMail[];
	waitForMessage: (timeoutMs?: number) => Promise<ParsedMail>;
	reset: () => void;
};

export type TestContext = {
	server: mailApiServer;
	store: mailStore;
	smtp: SmtpCapture;
	tempDir: string;
	configPath: string;
	uploadFile: string;
	uploadsPath: string;
	domainName: string;
	otherDomainName: string;
	contactFormKey: string;
	userToken: string;
	otherUserToken: string;
	apiUrl: string;
	apiBasePath: string;
	assetRoute: string;
	assetPublicBase: string;
	cleanup: () => Promise<void>;
};

export type TestContextOptions = {
	apiUrl?: string;
	apiBasePath?: string;
	assetRoute?: string;
	assetPublicBase?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PATH = path.join(__dirname, '../fixtures/certs/test.crt');
const KEY_PATH = path.join(__dirname, '../fixtures/certs/test.key');

function writeFixtureConfig(configPath: string, domainName: string, contactFormKey: string) {
	const domainRoot = path.join(configPath, domainName);
	const assetsRoot = path.join(domainRoot, 'assets');
	const txRoot = path.join(domainRoot, 'tx-template');
	const formRoot = path.join(domainRoot, 'form-template');

	fs.mkdirSync(path.join(assetsRoot, 'images'), { recursive: true });
	fs.mkdirSync(path.join(assetsRoot, 'files'), { recursive: true });
	fs.mkdirSync(path.join(txRoot, 'partials'), { recursive: true });
	fs.mkdirSync(path.join(formRoot, 'partials'), { recursive: true });

	fs.writeFileSync(path.join(assetsRoot, 'images', 'logo.png'), 'logo-bytes');
	fs.writeFileSync(path.join(assetsRoot, 'files', 'banner.png'), 'banner-bytes');

	const txBase = `<!doctype html>
<html>
  <head><title>{{ title }}</title></head>
  <body>
    {% block body %}{% endblock %}
  </body>
</html>
`;
	const txHeader = `<h1>{{ heading }}</h1>`;
	const txWelcome = `{% extends "base.njk" %}
{% block body %}
{% include "partials/header.njk" %}
<p>Hello {{ name }}</p>
<img src="asset('images/logo.png', true)" alt="logo" />
<img src="asset('files/banner.png')" alt="banner" />
{% endblock %}
`;

	fs.writeFileSync(path.join(txRoot, 'base.njk'), txBase);
	fs.writeFileSync(path.join(txRoot, 'partials', 'header.njk'), txHeader);
	fs.writeFileSync(path.join(txRoot, 'welcome.njk'), txWelcome);

	const formBase = `<!doctype html>
<html>
  <body>
    {% block body %}{% endblock %}
  </body>
</html>
`;
	const formFields = `<p>Name: {{ _fields_.name }}</p>
<p>Email: {{ _fields_.email }}</p>`;
	const formContact = `{% extends "base.njk" %}
{% block body %}
{% include "partials/fields.njk" %}
<p>IP: {{ _meta_.client_ip }}</p>
<img src="asset('images/logo.png', true)" alt="logo" />
{% endblock %}
`;

	fs.writeFileSync(path.join(formRoot, 'base.njk'), formBase);
	fs.writeFileSync(path.join(formRoot, 'partials', 'fields.njk'), formFields);
	fs.writeFileSync(path.join(formRoot, 'contact.njk'), formContact);

	const initData = {
		user: [
			{
				user_id: 1,
				idname: 'testuser',
				token: 'test-token',
				name: 'Test User',
				email: 'testuser@example.test',
				domain: 1
			},
			{
				user_id: 2,
				idname: 'otheruser',
				token: 'other-token',
				name: 'Other User',
				email: 'otheruser@example.test',
				domain: 2
			}
		],
		domain: [
			{
				domain_id: 1,
				user_id: 1,
				name: domainName,
				sender: 'Test Sender <sender@example.test>',
				is_default: true
			},
			{
				domain_id: 2,
				user_id: 2,
				name: 'other.test',
				sender: 'Other Sender <other@example.test>',
				is_default: true
			}
		],
		template: [
			{
				template_id: 1,
				user_id: 1,
				domain_id: 1,
				name: 'welcome',
				locale: '',
				template: '',
				filename: '',
				sender: 'sender@example.test',
				subject: 'Welcome!',
				slug: ''
			}
		],
		form: [
			{
				form_id: 1,
				form_key: contactFormKey,
				user_id: 1,
				domain_id: 1,
				locale: '',
				idname: 'contact',
				sender: 'forms@example.test',
				recipient: 'owner@example.test',
				subject: 'Contact',
				template: '',
				filename: '',
				slug: '',
				secret: '',
				replyto_email: '',
				replyto_from_fields: true,
				files: []
			}
		]
	};

	fs.writeFileSync(path.join(configPath, 'init-data.json'), JSON.stringify(initData, null, 2));
}

async function startSmtpServer(): Promise<SmtpCapture> {
	const cert = fs.readFileSync(CERT_PATH);
	const key = fs.readFileSync(KEY_PATH);
	const messages: ParsedMail[] = [];

	const server = new SMTPServer({
		secure: true,
		key,
		cert,
		authOptional: true,
		onData(stream, _session, callback) {
			const chunks: Buffer[] = [];
			stream.on('data', (chunk) => chunks.push(chunk));
			stream.on('end', async () => {
				try {
					const parsed = await simpleParser(Buffer.concat(chunks));
					messages.push(parsed);
					callback();
				} catch (err) {
					callback(err as Error);
				}
			});
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.server.address() as AddressInfo;
	const port = address.port;

	const waitForMessage = async (timeoutMs = 5000) => {
		const start = Date.now();
		while (messages.length === 0) {
			if (Date.now() - start > timeoutMs) {
				throw new Error('Timed out waiting for SMTP message');
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		const next = messages.shift();
		if (!next) {
			throw new Error('SMTP message queue was empty');
		}
		return next;
	};

	return {
		server,
		port,
		messages,
		waitForMessage,
		reset: () => {
			messages.length = 0;
		}
	};
}

export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-test-'));
	const configPath = path.join(tempDir, 'config');
	fs.mkdirSync(configPath, { recursive: true });

	const domainName = 'example.test';
	const otherDomainName = 'other.test';
	const contactFormKey = 'contact-form-key';
	writeFixtureConfig(configPath, domainName, contactFormKey);

	const smtp = await startSmtpServer();

	const uploadsPath = path.join(configPath, domainName, 'uploads');

	const uploadFile = path.join(tempDir, 'upload.txt');
	fs.writeFileSync(uploadFile, 'upload-bytes');

	const apiUrl = options.apiUrl ?? 'http://mail.test';
	const apiBasePath = options.apiBasePath ?? '/api';
	const assetRoute = options.assetRoute ?? '/asset';
	const assetPublicBase = options.assetPublicBase ?? '';

	const envOverrides = {
		NODE_ENV: 'development',
		CONFIG_PATH: configPath,
		DB_NAME: path.join(tempDir, 'mailmagic-test.db'),
		DB_TYPE: 'sqlite',
		DB_FORCE_SYNC: true,
		DB_SYNC_ALTER: true,
		DB_AUTO_RELOAD: false,
		API_URL: apiUrl,
		API_BASE_PATH: apiBasePath,
		ASSET_ROUTE: assetRoute,
		ASSET_PUBLIC_BASE: assetPublicBase,
		API_TOKEN_PEPPER: 'test-token-pepper-value',
		API_HOST: '127.0.0.1',
		API_PORT: 0,
		AUTOESCAPE_HTML: true,
		UPLOAD_PATH: './{domain}/uploads',
		UPLOAD_MAX: 30 * 1024 * 1024,
		FORM_RATE_LIMIT_WINDOW_SEC: 0,
		FORM_RATE_LIMIT_MAX: 0,
		FORM_MAX_ATTACHMENTS: -1,
		FORM_KEEP_UPLOADS: true,
		FORM_CAPTCHA_PROVIDER: 'turnstile',
		FORM_CAPTCHA_SECRET: '',
		FORM_CAPTCHA_REQUIRED: false,
		SMTP_HOST: '127.0.0.1',
		SMTP_PORT: smtp.port,
		SMTP_SECURE: true,
		SMTP_TLS_REJECT: false,
		SMTP_USER: '',
		SMTP_PASSWORD: '',
		DEBUG: false
	};

	const bootstrap = await createMailMagicServer({}, envOverrides);

	const cleanup = async () => {
		await new Promise<void>((resolve) => {
			smtp.server.close(() => resolve());
		});
		if (bootstrap.store.api_db) {
			await bootstrap.store.api_db.close();
		}
		fs.rmSync(tempDir, { recursive: true, force: true });
	};

	return {
		server: bootstrap.server,
		store: bootstrap.store,
		smtp,
		tempDir,
		configPath,
		uploadFile,
		uploadsPath,
		domainName,
		otherDomainName,
		contactFormKey,
		userToken: 'test-token',
		otherUserToken: 'other-token',
		apiUrl,
		apiBasePath,
		assetRoute,
		assetPublicBase,
		cleanup
	};
}
