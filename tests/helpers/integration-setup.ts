import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';

import { createMailMagicServer } from '../../packages/mail-magic/src/index.js';
import TemplateClient from '../../packages/mail-magic-client/src/mail-magic-client.js';

import type { ParsedMail } from 'mailparser';
import type { Server } from 'node:http';

const FIXTURE_ROOT = path.join(process.cwd(), 'tests', 'fixtures');
const CONFIG_FIXTURE = path.join(FIXTURE_ROOT, 'config');
const ATTACHMENT_FIXTURE = path.join(FIXTURE_ROOT, 'uploads', 'sample-attachment.txt');

const ENV_KEYS = [
	'NODE_ENV',
	'CONFIG_PATH',
	'DB_NAME',
	'DB_TYPE',
	'DB_FORCE_SYNC',
	'DB_SYNC_ALTER',
	'DB_AUTO_RELOAD',
	'API_URL',
	'ASSET_ROUTE',
	'API_HOST',
	'API_PORT',
	'API_TOKEN_PEPPER',
	'AUTOESCAPE_HTML',
	'UPLOAD_PATH',
	'UPLOAD_MAX',
	'FORM_RATE_LIMIT_WINDOW_SEC',
	'FORM_RATE_LIMIT_MAX',
	'FORM_MAX_ATTACHMENTS',
	'FORM_KEEP_UPLOADS',
	'FORM_CAPTCHA_PROVIDER',
	'FORM_CAPTCHA_SECRET',
	'FORM_CAPTCHA_REQUIRED',
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_SECURE',
	'SMTP_TLS_REJECT',
	'SMTP_USER',
	'SMTP_PASSWORD',
	'DEBUG'
];

type EnvSnapshot = Record<string, string | undefined>;

type SmtpCapture = {
	server: SMTPServer;
	port: number;
	messages: ParsedMail[];
	waitForMessages: (expected: number, timeoutMs?: number) => Promise<void>;
	waitForMessage: (timeoutMs?: number) => Promise<ParsedMail>;
	reset: () => void;
	close: () => Promise<void>;
};

export type IntegrationContext = {
	api: ReturnType<typeof request>;
	baseUrl: string;
	clients: {
		alpha: TemplateClient;
		beta: TemplateClient;
	};
	configPath: string;
	domainAlpha: string;
	domainBeta: string;
	smtp: SmtpCapture;
	tempDir: string;
	attachmentPath: string;
	cleanup: () => Promise<void>;
};

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

function copyDir(src: string, dest: string) {
	if (!fs.existsSync(src)) {
		throw new Error(`Fixture path not found: ${src}`);
	}
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else if (entry.isFile()) {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function getAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

async function startSmtpServer(): Promise<SmtpCapture> {
	const messages: ParsedMail[] = [];
	const server = new SMTPServer({
		secure: false,
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

	const address = server.server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	const waitForMessages = async (expected: number, timeoutMs = 8000) => {
		const start = Date.now();
		while (messages.length < expected) {
			if (Date.now() - start > timeoutMs) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	};

	const waitForMessage = async (timeoutMs = 8000) => {
		const start = Date.now();
		while (messages.length === 0) {
			if (Date.now() - start > timeoutMs) {
				throw new Error('Timed out waiting for SMTP message');
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		const message = messages.shift();
		if (!message) {
			throw new Error('SMTP message queue was empty');
		}
		return message;
	};

	return {
		server,
		port,
		messages,
		waitForMessages,
		waitForMessage,
		reset: () => {
			messages.length = 0;
		},
		close: () => new Promise((resolve) => server.close(() => resolve()))
	};
}

export async function createIntegrationContext(): Promise<IntegrationContext> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-integration-'));
	const configPath = path.join(tempDir, 'config');
	copyDir(CONFIG_FIXTURE, configPath);

	const smtp = await startSmtpServer();
	const port = await getAvailablePort();
	const apiUrl = `http://127.0.0.1:${port}/api`;

	const envSnapshot = snapshotEnv(ENV_KEYS);
	process.env.NODE_ENV = 'development';
	process.env.CONFIG_PATH = configPath;
	process.env.DB_NAME = path.join(tempDir, 'mailmagic-test.db');
	process.env.DB_TYPE = 'sqlite';
	process.env.DB_FORCE_SYNC = 'true';
	process.env.DB_SYNC_ALTER = 'true';
	process.env.DB_AUTO_RELOAD = 'false';
	process.env.API_URL = apiUrl;
	process.env.ASSET_ROUTE = '/asset';
	process.env.API_HOST = '127.0.0.1';
	process.env.API_PORT = String(port);
	process.env.API_TOKEN_PEPPER = 'integration-token-pepper-value';
	process.env.AUTOESCAPE_HTML = 'true';
	process.env.UPLOAD_PATH = './{domain}/uploads';
	process.env.UPLOAD_MAX = String(30 * 1024 * 1024);
	process.env.FORM_RATE_LIMIT_WINDOW_SEC = '0';
	process.env.FORM_RATE_LIMIT_MAX = '0';
	process.env.FORM_MAX_ATTACHMENTS = '-1';
	process.env.FORM_KEEP_UPLOADS = 'true';
	process.env.FORM_CAPTCHA_PROVIDER = 'turnstile';
	process.env.FORM_CAPTCHA_SECRET = '';
	process.env.FORM_CAPTCHA_REQUIRED = 'false';
	process.env.SMTP_HOST = '127.0.0.1';
	process.env.SMTP_PORT = String(smtp.port);
	process.env.SMTP_SECURE = 'false';
	process.env.SMTP_TLS_REJECT = 'false';
	process.env.SMTP_USER = '';
	process.env.SMTP_PASSWORD = '';
	process.env.DEBUG = 'false';

	const bootstrap = await createMailMagicServer({ apiBasePath: '' });
	const listener: Server = bootstrap.server.app.listen(port, '127.0.0.1');

	const api = request(bootstrap.server.app);
	const baseUrl = `http://127.0.0.1:${port}`;

	const cleanup = async () => {
		await new Promise<void>((resolve) => listener.close(() => resolve()));
		await smtp.close();
		if (bootstrap.store.api_db) {
			await bootstrap.store.api_db.close();
		}
		restoreEnv(envSnapshot);
		fs.rmSync(tempDir, { recursive: true, force: true });
	};

	return {
		api,
		baseUrl,
		clients: {
			alpha: new TemplateClient(baseUrl, 'alpha-token'),
			beta: new TemplateClient(baseUrl, 'beta-token')
		},
		configPath,
		domainAlpha: 'alpha.example.test',
		domainBeta: 'beta.example.test',
		smtp,
		tempDir,
		attachmentPath: ATTACHMENT_FIXTURE,
		cleanup
	};
}
