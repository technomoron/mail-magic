import fs from 'fs';
import path from 'path';
import { EnvLoader } from '@technomoron/env-loader';
import { watch as chokidarWatch } from 'chokidar';
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
export function enableInitDataAutoReload(ctx, reload, reloadForce) {
    if (!ctx.vars.DB_AUTO_RELOAD) {
        return null;
    }
    const initDataPath = ctx.config_filename('init-data.json');
    const configPath = path.dirname(initDataPath);
    const debounceMs = ctx.vars.DB_RELOAD_DEBOUNCE_MS ?? 300;
    function makeDebounced(fn, label) {
        let timer = null;
        const trigger = () => {
            if (timer)
                clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                ctx.print_debug(label);
                // fn() may be sync or async — try/catch handles a synchronous
                // throw, while Promise.resolve().catch() handles an async rejection.
                try {
                    Promise.resolve(fn()).catch((err) => {
                        ctx.print_debug(`Failed to reload: ${err}`);
                    });
                }
                catch (err) {
                    ctx.print_debug(`Failed to reload: ${err}`);
                }
            }, debounceMs);
        };
        const cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        return { trigger, cancel };
    }
    ctx.print_debug('Enabling auto reload of init-data.json');
    const dataReload = makeDebounced(reload, 'Config file changed, reloading...');
    // Watch init-data.json with fs.watch (+ fs.watchFile fallback).
    let closeDataWatcher;
    try {
        const watcher = fs.watch(initDataPath, { persistent: false }, dataReload.trigger);
        closeDataWatcher = () => watcher.close();
    }
    catch (err) {
        ctx.print_debug(`fs.watch unavailable; falling back to fs.watchFile: ${err}`);
        fs.watchFile(initDataPath, { interval: 2000 }, dataReload.trigger);
        closeDataWatcher = () => fs.unwatchFile(initDataPath, dataReload.trigger);
    }
    // Watch *.njk files under configPath with chokidar (cross-platform recursive).
    let closeTemplateWatcher = null;
    if (reloadForce) {
        ctx.print_debug('Enabling auto reload of template files');
        const templateReload = makeDebounced(reloadForce, 'Template file changed, reloading...');
        const watcher = chokidarWatch(path.join(configPath, '**', '*.njk'), {
            persistent: false,
            ignoreInitial: true
        });
        watcher.on('add', templateReload.trigger);
        watcher.on('change', templateReload.trigger);
        closeTemplateWatcher = () => {
            templateReload.cancel();
            void watcher.close();
        };
    }
    return {
        close: () => {
            dataReload.cancel();
            closeDataWatcher();
            closeTemplateWatcher?.();
        }
    };
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
    reloadInProgress = false;
    reloadQueued = false;
    reloadQueuedForce = false;
    print_debug(msg) {
        if (this.vars.DEBUG) {
            console.log(msg);
        }
    }
    config_filename(name) {
        return path.resolve(path.join(this.configpath, name));
    }
    /**
     * Trigger an importData reload. If a reload is already in progress the request is
     * queued (at most one pending run) so no reload is silently dropped. Returns
     * 'triggered' when a new run starts, or 'queued' when one is already running.
     */
    triggerReload(force = false) {
        if (this.reloadInProgress) {
            this.reloadQueued = true;
            if (force)
                this.reloadQueuedForce = true;
            this.print_debug(`Reload already in progress; queued (force=${force})`);
            return 'queued';
        }
        this.reloadInProgress = true;
        this.print_debug(`Triggering reload (force=${force})`);
        const fn = force ? () => importData(this, { force: true }) : () => importData(this);
        Promise.resolve(fn())
            .catch((err) => this.print_debug(`Reload failed: ${err}`))
            .finally(() => {
            this.reloadInProgress = false;
            if (this.reloadQueued) {
                this.reloadQueued = false;
                const queued = this.reloadQueuedForce;
                this.reloadQueuedForce = false;
                this.triggerReload(queued);
            }
        });
        return 'triggered';
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
            const name = (file.originalname ?? file.filepath) ? path.basename(file.filepath ?? file.originalname ?? '') : '';
            if (!name) {
                return;
            }
            const destination = path.join(targetDir, name);
            if (file.buffer) {
                await fs.promises.writeFile(destination, file.buffer);
                file.filepath = destination;
                file.buffer = undefined;
            }
            else if (file.filepath) {
                if (destination === file.filepath) {
                    return;
                }
                try {
                    await fs.promises.rename(file.filepath, destination);
                }
                catch {
                    await fs.promises.copyFile(file.filepath, destination);
                    await fs.promises.unlink(file.filepath);
                }
                file.filepath = destination;
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
            }
            catch (err) {
                this.print_debug(`Unable to create upload staging path: ${err}`);
            }
        }
        this.transport = await create_mail_transport(this.vars);
        this.api_db = await connect_api_db(this);
        this.autoReloadHandle?.close();
        this.autoReloadHandle = enableInitDataAutoReload(this, () => {
            this.triggerReload(false);
        }, () => {
            this.triggerReload(true);
        });
        return this;
    }
}
