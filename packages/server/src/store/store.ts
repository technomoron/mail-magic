import fs from 'fs';
import path from 'path';

import { EnvLoader, envConfig } from '@technomoron/env-loader';
import { createTransport, Transporter } from 'nodemailer';
import { Sequelize } from 'sequelize';

import { connect_api_db } from '../models/db.js';
import { importData } from '../models/init.js';

import { envOptions } from './envloader.js';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type UploadedFile = {
	fieldname?: string;
	originalname?: string;
	filepath?: string;
	buffer?: Buffer;
};

export type MailStoreVars = envConfig<typeof envOptions>;
type AutoReloadHandle = {
	close: () => void;
};

type AutoReloadContext = {
	vars: Pick<MailStoreVars, 'DB_AUTO_RELOAD'>;
	config_filename: (name: string) => string;
	print_debug: (msg: string) => void;
};

function create_mail_transport(vars: MailStoreVars): Transporter {
	const args: SMTPTransport.Options = {
		host: vars.SMTP_HOST,
		port: vars.SMTP_PORT,
		secure: vars.SMTP_SECURE,
		tls: {
			rejectUnauthorized: vars.SMTP_TLS_REJECT
		},
		requireTLS: vars.SMTP_REQUIRE_TLS,
		logger: vars.DEBUG,
		debug: vars.DEBUG
	};
	const user = vars.SMTP_USER;
	const pass = vars.SMTP_PASSWORD;
	if (user && pass) {
		args.auth = { user, pass };
	}

	return createTransport(args);
}

export function enableInitDataAutoReload(
	ctx: AutoReloadContext,
	reload: () => void | Promise<void>
): AutoReloadHandle | null {
	if (!ctx.vars.DB_AUTO_RELOAD) {
		return null;
	}
	const initDataPath = ctx.config_filename('init-data.json');
	ctx.print_debug('Enabling auto reload of init-data.json');
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const onChange = () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			ctx.print_debug('Config file changed, reloading...');
			// reload() may be sync or async — try/catch handles a synchronous
			// throw, while Promise.resolve().catch() handles an async rejection.
			try {
				Promise.resolve(reload()).catch((err) => {
					ctx.print_debug(`Failed to reload config: ${err}`);
				});
			} catch (err) {
				ctx.print_debug(`Failed to reload config: ${err}`);
			}
		}, 300);
	};

	try {
		const watcher = fs.watch(initDataPath, { persistent: false }, onChange);
		return {
			close: () => watcher.close()
		};
	} catch (err) {
		ctx.print_debug(`fs.watch unavailable; falling back to fs.watchFile: ${err}`);
		fs.watchFile(initDataPath, { interval: 2000 }, onChange);
		return {
			close: () => fs.unwatchFile(initDataPath, onChange)
		};
	}
}

export class mailStore {
	private env!: envConfig<typeof envOptions>;
	vars!: MailStoreVars;
	transport?: Transporter<SMTPTransport.SentMessageInfo>;
	api_db: Sequelize | null = null;
	configpath = '';
	uploadTemplate?: string;
	uploadStagingPath?: string;
	autoReloadHandle: AutoReloadHandle | null = null;

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
				const name =
					(file.originalname ?? file.filepath) ? path.basename(file.filepath ?? file.originalname ?? '') : '';
				if (!name) {
					return;
				}
				const destination = path.join(targetDir, name);
				if (file.buffer) {
					await fs.promises.writeFile(destination, file.buffer);
					file.filepath = destination;
					file.buffer = undefined;
				} else if (file.filepath) {
					if (destination === file.filepath) {
						return;
					}
					try {
						await fs.promises.rename(file.filepath, destination);
					} catch {
						await fs.promises.copyFile(file.filepath, destination);
						await fs.promises.unlink(file.filepath);
					}
					file.filepath = destination;
				}
			})
		);
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
		if (this.vars.GEN_ENV_TEMPLATE) {
			EnvLoader.genTemplate(envOptions, '.env-dist');
		}
		const p = this.vars.CONFIG_PATH;
		this.configpath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
		this.print_debug(`Config path is ${this.configpath}`);

		if (this.vars.UPLOAD_PATH && this.vars.UPLOAD_PATH.includes('{domain}')) {
			this.uploadTemplate = this.vars.UPLOAD_PATH;
			this.uploadStagingPath = path.resolve(this.configpath, '_uploads');
			try {
				fs.mkdirSync(this.uploadStagingPath, { recursive: true });
			} catch (err) {
				this.print_debug(`Unable to create upload staging path: ${err}`);
			}
		}

		this.transport = await create_mail_transport(this.vars);

		this.api_db = await connect_api_db(this);

		this.autoReloadHandle?.close();
		this.autoReloadHandle = enableInitDataAutoReload(this, () => importData(this));

		return this;
	}
}
