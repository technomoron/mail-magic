import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';

import TemplateClient from '../../packages/client/src/mail-magic-client.js';
import { createMailMagicServer } from '../../packages/server/src/index.js';

import type { ParsedMail } from 'mailparser';
import type { Server } from 'node:http';

const FIXTURE_ROOT = path.join(process.cwd(), 'tests', 'fixtures');
const CONFIG_FIXTURE = path.join(FIXTURE_ROOT, 'config');
const ATTACHMENT_FIXTURE = path.join(FIXTURE_ROOT, 'uploads', 'sample-attachment.txt');

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

	const envOverrides = {
		NODE_ENV: 'development',
		CONFIG_PATH: configPath,
		DB_NAME: path.join(tempDir, 'mailmagic-test.db'),
		DB_TYPE: 'sqlite',
		DB_FORCE_SYNC: true,
		DB_SYNC_ALTER: true,
		DB_AUTO_RELOAD: false,
		API_URL: apiUrl,
		ASSET_ROUTE: '/asset',
		API_HOST: '127.0.0.1',
		API_PORT: port,
		API_TOKEN_PEPPER: 'integration-token-pepper-value',
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
		SMTP_SECURE: false,
		SMTP_TLS_REJECT: false,
		SMTP_USER: '',
		SMTP_PASSWORD: '',
		DEBUG: false
	};

	const bootstrap = await createMailMagicServer({ apiBasePath: '' }, envOverrides);
	const listener: Server = bootstrap.server.app.listen(port, '127.0.0.1');

	const api = request(bootstrap.server.app);
	const baseUrl = `http://127.0.0.1:${port}`;

	const cleanup = async () => {
		await new Promise<void>((resolve) => listener.close(() => resolve()));
		await smtp.close();
		if (bootstrap.store.api_db) {
			await bootstrap.store.api_db.close();
		}
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
