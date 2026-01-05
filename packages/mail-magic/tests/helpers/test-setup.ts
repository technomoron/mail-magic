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

type EnvSnapshot = Record<string, string | undefined>;

export type TestContext = {
	server: mailApiServer;
	store: mailStore;
	smtp: SmtpCapture;
	tempDir: string;
	configPath: string;
	uploadFile: string;
	uploadsPath: string;
	domainName: string;
	userToken: string;
	apiUrl: string;
	cleanup: () => Promise<void>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PATH = path.join(__dirname, '../fixtures/certs/test.crt');
const KEY_PATH = path.join(__dirname, '../fixtures/certs/test.key');

function snapshotEnv(keys: string[]): EnvSnapshot {
	return keys.reduce<EnvSnapshot>((acc, key) => {
		acc[key] = process.env[key];
		return acc;
	}, {});
}

function restoreEnv(snapshot: EnvSnapshot) {
	for (const [key, value] of Object.entries(snapshot)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function writeFixtureConfig(configPath: string, domainName: string) {
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
			}
		],
		domain: [
			{
				domain_id: 1,
				user_id: 1,
				name: domainName,
				sender: 'Test Sender <sender@example.test>',
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
				secret: 's3cret',
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

export async function createTestContext(): Promise<TestContext> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-test-'));
	const configPath = path.join(tempDir, 'config');
	fs.mkdirSync(configPath, { recursive: true });

	const domainName = 'example.test';
	writeFixtureConfig(configPath, domainName);

	const smtp = await startSmtpServer();

	const uploadsPath = path.join(configPath, domainName, 'uploads');

	const uploadFile = path.join(tempDir, 'upload.txt');
	fs.writeFileSync(uploadFile, 'upload-bytes');

	const apiUrl = 'http://mail.test/api';

	const envKeys = [
		'NODE_ENV',
		'CONFIG_PATH',
		'DB_NAME',
		'DB_TYPE',
		'DB_FORCE_SYNC',
		'DB_AUTO_RELOAD',
		'API_URL',
		'ASSET_ROUTE',
		'API_HOST',
		'API_PORT',
		'UPLOAD_PATH',
		'SMTP_HOST',
		'SMTP_PORT',
		'SMTP_SECURE',
		'SMTP_TLS_REJECT',
		'SMTP_USER',
		'SMTP_PASSWORD',
		'DEBUG'
	];
	const envSnapshot = snapshotEnv(envKeys);

	process.env.NODE_ENV = 'development';
	process.env.CONFIG_PATH = configPath;
	process.env.DB_NAME = path.join(tempDir, 'mailmagic-test.db');
	process.env.DB_TYPE = 'sqlite';
	process.env.DB_FORCE_SYNC = 'true';
	process.env.DB_AUTO_RELOAD = 'false';
	process.env.API_URL = apiUrl;
	process.env.ASSET_ROUTE = '/asset';
	process.env.API_HOST = '127.0.0.1';
	process.env.API_PORT = '0';
	process.env.UPLOAD_PATH = './{domain}/uploads';
	process.env.SMTP_HOST = '127.0.0.1';
	process.env.SMTP_PORT = String(smtp.port);
	process.env.SMTP_SECURE = 'true';
	process.env.SMTP_TLS_REJECT = 'false';
	process.env.SMTP_USER = '';
	process.env.SMTP_PASSWORD = '';
	process.env.DEBUG = 'false';

	const bootstrap = await createMailMagicServer({ apiBasePath: '' });

	const cleanup = async () => {
		await new Promise<void>((resolve) => {
			smtp.server.close(() => resolve());
		});
		if (bootstrap.store.api_db) {
			await bootstrap.store.api_db.close();
		}
		restoreEnv(envSnapshot);
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
		userToken: 'test-token',
		apiUrl,
		cleanup
	};
}
