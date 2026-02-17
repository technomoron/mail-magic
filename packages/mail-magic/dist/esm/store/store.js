import fs from 'fs';
import path from 'path';
import { EnvLoader } from '@technomoron/env-loader';
import { createTransport } from 'nodemailer';
import { connect_api_db } from '../models/db.js';
import { importData } from '../models/init.js';
import { envOptions } from './envloader.js';
function create_mail_transport(vars) {
    const args = {
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
    const mailer = createTransport({
        ...args
    });
    return mailer;
}
export function enableInitDataAutoReload(ctx, reload) {
    if (!ctx.vars.DB_AUTO_RELOAD) {
        return null;
    }
    const initDataPath = ctx.config_filename('init-data.json');
    ctx.print_debug('Enabling auto reload of init-data.json');
    const onChange = () => {
        ctx.print_debug('Config file changed, reloading...');
        try {
            reload();
        }
        catch (err) {
            ctx.print_debug(`Failed to reload config: ${err}`);
        }
    };
    try {
        const watcher = fs.watch(initDataPath, { persistent: false }, onChange);
        return {
            close: () => watcher.close()
        };
    }
    catch (err) {
        ctx.print_debug(`fs.watch unavailable; falling back to fs.watchFile: ${err}`);
        fs.watchFile(initDataPath, { interval: 2000 }, onChange);
        return {
            close: () => fs.unwatchFile(initDataPath, onChange)
        };
    }
}
export class mailStore {
    env;
    vars;
    transport;
    api_db = null;
    configpath = '';
    uploadTemplate;
    uploadStagingPath;
    autoReloadHandle = null;
    print_debug(msg) {
        if (this.vars.DEBUG) {
            console.log(msg);
        }
    }
    config_filename(name) {
        return path.resolve(path.join(this.configpath, name));
    }
    resolveUploadPath(domainName) {
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
    getUploadStagingPath() {
        if (!this.vars.UPLOAD_PATH) {
            return '';
        }
        if (this.uploadTemplate) {
            return this.uploadStagingPath || path.resolve(this.configpath, '_uploads');
        }
        return this.resolveUploadPath();
    }
    async relocateUploads(domainName, files) {
        if (!this.uploadTemplate || !domainName || !files?.length) {
            return;
        }
        const targetDir = this.resolveUploadPath(domainName);
        if (!targetDir) {
            return;
        }
        await fs.promises.mkdir(targetDir, { recursive: true });
        await Promise.all(files.map(async (file) => {
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
            }
            catch {
                await fs.promises.copyFile(file.path, destination);
                await fs.promises.unlink(file.path);
            }
            file.path = destination;
            if (file.destination !== undefined) {
                file.destination = targetDir;
            }
        }));
    }
    async init(overrides = {}) {
        // Load env config only via EnvLoader + envOptions (avoid ad-hoc `process.env` parsing here).
        // If DEBUG is enabled, re-load with EnvLoader debug output enabled.
        const overrideEntries = Object.entries(overrides);
        const envSnapshot = new Map();
        if (overrideEntries.length > 0) {
            for (const [key, value] of overrideEntries) {
                envSnapshot.set(key, process.env[key]);
                if (value === undefined || value === null) {
                    delete process.env[key];
                }
                else {
                    process.env[key] = String(value);
                }
            }
        }
        let env;
        try {
            env = await EnvLoader.createConfigProxy(envOptions, { debug: false });
            const debugEnabled = overrides.DEBUG ?? env.DEBUG;
            if (debugEnabled) {
                env = await EnvLoader.createConfigProxy(envOptions, { debug: true });
            }
        }
        finally {
            if (envSnapshot.size > 0) {
                for (const [key, value] of envSnapshot.entries()) {
                    if (value === undefined) {
                        delete process.env[key];
                    }
                    else {
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
            }
            catch (err) {
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
