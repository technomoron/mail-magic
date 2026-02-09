import fs from 'fs';
import path from 'path';

import { EnvLoader, envConfig } from '@technomoron/env-loader';
import { createTransport, Transporter } from 'nodemailer';
import { Sequelize } from 'sequelize';

import { connect_api_db } from '../models/db.js';
import { importData } from '../models/init.js';

import { envOptions } from './envloader.js';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';

interface api_key {
	keyid: string;
	uid: number;
	domain: number;
}

type UploadedFile = {
	path: string;
	filename?: string;
	destination?: string;
};

export type MailStoreVars = envConfig<typeof envOptions>;

function create_mail_transport(vars: MailStoreVars): Transporter {
	const args: SMTPTransport.Options = {
		host: vars.SMTP_HOST,
		port: vars.SMTP_PORT,
		secure: vars.SMTP_SECURE,
		tls: {
			rejectUnauthorized: vars.SMTP_TLS_REJECT
		},
		requireTLS: true,
		logger: vars.DEBUG,
		debug: vars.DEBUG
	};
	const user = vars.SMTP_USER;
	const pass = vars.SMTP_PASSWORD;
	if (user && pass) {
		args.auth = { user, pass };
	}
	// console.log(JSON.stringify(args, undefined, 2));

	const mailer: Transporter = createTransport({
		...args
	});
	if (!mailer) {
		throw new Error('Unable to create mailer');
	}
	return mailer;
}

export interface ImailStore {
	vars: MailStoreVars;
	transport?: Transporter<SMTPTransport.SentMessageInfo>;
	keys: Record<string, api_key>;
	configpath: string;
	deflocale?: string;
	uploadTemplate?: string;
	uploadStagingPath?: string;
}

export class mailStore implements ImailStore {
	private env!: envConfig<typeof envOptions>;
	vars!: MailStoreVars;
	transport?: Transporter<SMTPTransport.SentMessageInfo>;
	api_db: Sequelize | null = null;
	keys: Record<string, api_key> = {};
	configpath = '';
	deflocale?: string;
	uploadTemplate?: string;
	uploadStagingPath?: string;

	print_debug(msg: string) {
		if (this.vars.DEBUG) {
			console.log(msg);
		}
	}

	config_filename(name: string): string {
		return path.resolve(path.join(this.configpath, name));
	}

	resolveUploadPath(domainName?: string): string {
		const raw = this.vars.UPLOAD_PATH ?? '';
		const hasDomainToken = raw.includes('{domain}');
		const expanded = hasDomainToken && domainName ? raw.replaceAll('{domain}', domainName) : raw;
		if (!expanded) {
			return '';
		}
		if (path.isAbsolute(expanded)) {
			return expanded;
		}
		const base = hasDomainToken ? this.configpath : process.cwd();
		return path.resolve(base, expanded);
	}

	getUploadStagingPath(): string {
		if (!this.vars.UPLOAD_PATH) {
			return '';
		}
		if (this.uploadTemplate) {
			return this.uploadStagingPath || path.resolve(this.configpath, '_uploads');
		}
		return this.resolveUploadPath();
	}

	async relocateUploads(domainName: string | null, files: UploadedFile[]): Promise<void> {
		if (!this.uploadTemplate || !domainName || !files?.length) {
			return;
		}
		const targetDir = this.resolveUploadPath(domainName);
		if (!targetDir) {
			return;
		}
		await fs.promises.mkdir(targetDir, { recursive: true });
		await Promise.all(
			files.map(async (file) => {
				if (!file?.path) {
					return;
				}
				const basename = path.basename(file.path);
				const destination = path.join(targetDir, basename);
				if (destination === file.path) {
					return;
				}
				try {
					await fs.promises.rename(file.path, destination);
				} catch {
					await fs.promises.copyFile(file.path, destination);
					await fs.promises.unlink(file.path);
				}
				file.path = destination;
				if (file.destination !== undefined) {
					file.destination = targetDir;
				}
			})
		);
	}

	private async load_api_keys(cfgpath: string): Promise<Record<string, api_key>> {
		const keyfile = path.resolve(cfgpath, 'api-keys.json');
		if (fs.existsSync(keyfile)) {
			const raw = fs.readFileSync(keyfile, 'utf-8');
			const jsonData = JSON.parse(raw) as Record<string, api_key>;
			this.print_debug(`API Key Database loaded from ${keyfile}`);
			return jsonData;
		}
		this.print_debug(`No api-keys.json file found: tried ${keyfile}`);
		return {};
	}

	async init(overrides: Partial<MailStoreVars> = {}): Promise<this> {
		// Load env config only via EnvLoader + envOptions (avoid ad-hoc `process.env` parsing here).
		// If DEBUG is enabled, re-load with EnvLoader debug output enabled.
		const overrideEntries = Object.entries(overrides);
		const envSnapshot = new Map<string, string | undefined>();
		if (overrideEntries.length > 0) {
			for (const [key, value] of overrideEntries) {
				envSnapshot.set(key, process.env[key]);
				if (value === undefined || value === null) {
					delete process.env[key];
				} else {
					process.env[key] = String(value);
				}
			}
		}
		let env: envConfig<typeof envOptions>;
		try {
			env = await EnvLoader.createConfigProxy(envOptions, { debug: false });
			const debugEnabled = overrides.DEBUG ?? env.DEBUG;
			if (debugEnabled) {
				env = await EnvLoader.createConfigProxy(envOptions, { debug: true });
			}
		} finally {
			if (envSnapshot.size > 0) {
				for (const [key, value] of envSnapshot.entries()) {
					if (value === undefined) {
						delete process.env[key];
					} else {
						process.env[key] = value;
					}
				}
			}
		}
		this.env = env;
		this.vars = { ...env, ...overrides };
		if (this.vars.FORM_CAPTCHA_REQUIRED && !String(this.vars.FORM_CAPTCHA_SECRET ?? '').trim()) {
			throw new Error('FORM_CAPTCHA_SECRET must be set when FORM_CAPTCHA_REQUIRED=true');
		}
		EnvLoader.genTemplate(envOptions, '.env-dist');
		const p = this.vars.CONFIG_PATH;
		this.configpath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
		console.log(`Config path is ${this.configpath}`);

		if (this.vars.UPLOAD_PATH && this.vars.UPLOAD_PATH.includes('{domain}')) {
			this.uploadTemplate = this.vars.UPLOAD_PATH;
			this.uploadStagingPath = path.resolve(this.configpath, '_uploads');
			try {
				fs.mkdirSync(this.uploadStagingPath, { recursive: true });
			} catch (err) {
				this.print_debug(`Unable to create upload staging path: ${err}`);
			}
		}

		// this.keys = await this.load_api_keys(this.configpath);

		this.transport = await create_mail_transport(this.vars);

		this.api_db = await connect_api_db(this);

		if (this.vars.DB_AUTO_RELOAD) {
			this.print_debug('Enabling auto reload of init-data.json');
			fs.watchFile(this.config_filename('init-data.json'), { interval: 2000 }, () => {
				this.print_debug('Config file changed, reloading...');
				try {
					importData(this);
				} catch (err) {
					this.print_debug(`Failed to reload config: ${err}`);
				}
			});
		}

		return this;
	}

	public get_api_key(key: string): api_key | null {
		return this.keys[key] || null;
	}
}
