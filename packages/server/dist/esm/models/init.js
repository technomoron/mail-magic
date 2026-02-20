import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { buildAssetUrl } from '../util/paths.js';
import { flattenTemplateWithAssets } from '../util/shared-template-flatten.js';
import { user_and_domain } from '../util.js';
import { api_domain, api_domain_schema } from './domain.js';
import { api_form_schema, upsert_form } from './form.js';
import { api_txmail_schema, upsert_txmail } from './txmail.js';
import { apiTokenToHmac, api_user, api_user_schema } from './user.js';
function buildInlineAssetCid(urlPath) {
    // Many mail clients are picky about Content-ID values. Keep it stable and avoid path separators.
    // Use a sanitized urlPath so nested assets remain unique without embedding `/` in the CID.
    const normalized = String(urlPath || '')
        .trim()
        .replace(/\\/g, '/');
    const safe = normalized.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
    return (safe || 'asset').slice(0, 200);
}
const init_data_schema = z.object({
    user: z.array(api_user_schema).default([]),
    domain: z.array(api_domain_schema).default([]),
    template: z.array(api_txmail_schema).default([]),
    form: z.array(api_form_schema).default([])
});
async function _load_template(store, filename, pathname, user, domain, locale, type) {
    const rootDir = path.join(store.configpath, domain.name, type);
    let relFile = filename;
    const prefix = path.join(domain.name, type) + path.sep;
    if (filename.startsWith(prefix)) {
        relFile = filename.slice(prefix.length);
    }
    const resolvedRoot = path.resolve(rootDir);
    const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    const absPath = path.resolve(resolvedRoot, pathname || '', relFile);
    if (!absPath.startsWith(normalizedRoot)) {
        throw new Error(`Invalid template path "${filename}"`);
    }
    if (!fs.existsSync(absPath)) {
        throw new Error(`Missing template file "${absPath}"`);
    }
    const raw = fs.readFileSync(absPath, 'utf8');
    if (!raw.trim()) {
        throw new Error(`Template file "${absPath}" is empty`);
    }
    try {
        const baseConfigPath = store.configpath;
        const domainRoot = path.join(baseConfigPath, domain.name);
        const templateKey = path.relative(domainRoot, absPath);
        if (!templateKey || templateKey.startsWith('..')) {
            throw new Error(`Unable to resolve template path for "${absPath}"`);
        }
        const assetBaseUrl = store.vars.ASSET_PUBLIC_BASE?.trim() ? store.vars.ASSET_PUBLIC_BASE : store.vars.API_URL;
        const assetRoute = store.vars.ASSET_ROUTE;
        const { html, assets } = flattenTemplateWithAssets({
            domainRoot,
            templateKey,
            baseUrl: assetBaseUrl,
            assetFormatter: (urlPath) => buildAssetUrl(assetBaseUrl, assetRoute, domain.name, urlPath),
            normalizeInlineCid: buildInlineAssetCid
        });
        return { html, assets: assets };
    }
    catch (err) {
        throw new Error(`Template "${absPath}" failed to preprocess: ${err.message}`);
    }
}
export async function loadFormTemplate(store, form) {
    const { user, domain } = await user_and_domain(form.domain_id);
    const locale = form.locale || domain.locale || user.locale || null;
    return _load_template(store, form.filename, '', user, domain, locale, 'form-template');
}
export async function loadTxTemplate(store, template) {
    const { user, domain } = await user_and_domain(template.domain_id);
    const locale = template.locale || domain.locale || user.locale || null;
    return _load_template(store, template.filename, '', user, domain, locale, 'tx-template');
}
export async function importData(store) {
    const initfile = path.join(store.configpath, 'init-data.json');
    if (fs.existsSync(initfile)) {
        store.print_debug(`Loading init data from ${initfile}`);
        const data = await fs.promises.readFile(initfile, 'utf8');
        let records;
        try {
            records = init_data_schema.parse(JSON.parse(data));
        }
        catch (err) {
            store.print_debug(`Invalid init-data.json: ${err}`);
            return;
        }
        const pendingUserDomains = [];
        if (records.user) {
            store.print_debug('Creating user records');
            for (const record of records.user) {
                const { domain, token, token_hmac, ...userWithoutDomain } = record;
                let resolvedTokenHmac;
                if (typeof token_hmac === 'string' && token_hmac) {
                    resolvedTokenHmac = token_hmac;
                }
                else if (typeof token === 'string' && token) {
                    resolvedTokenHmac = apiTokenToHmac(token, store.vars.API_TOKEN_PEPPER);
                }
                else {
                    throw new Error(`User ${record.user_id} is missing token or token_hmac`);
                }
                await api_user.upsert({ ...userWithoutDomain, token: '', token_hmac: resolvedTokenHmac, domain: null });
                if (typeof domain === 'number') {
                    pendingUserDomains.push({ user_id: record.user_id, domain });
                }
            }
        }
        if (records.domain) {
            store.print_debug('Creating domain records');
            for (const record of records.domain) {
                await api_domain.upsert(record);
            }
        }
        if (pendingUserDomains.length) {
            store.print_debug('Linking user default domains');
            for (const entry of pendingUserDomains) {
                await api_user.update({ domain: entry.domain }, { where: { user_id: entry.user_id } });
            }
        }
        if (records.template) {
            store.print_debug('Creating template records');
            for (const record of records.template) {
                const fixed = await upsert_txmail(record);
                if (!fixed.template) {
                    const { html, assets } = await loadTxTemplate(store, fixed);
                    await fixed.update({ template: html, files: assets });
                }
            }
        }
        if (records.form) {
            store.print_debug('Creating form records');
            for (const record of records.form) {
                const fixed = await upsert_form(record);
                if (!fixed.template) {
                    const { html, assets } = await loadFormTemplate(store, fixed);
                    await fixed.update({ template: html, files: assets });
                }
            }
        }
        store.print_debug('Initdata upserted successfully.');
    }
    else {
        store.print_debug(`No init data file, tried ${initfile}`);
    }
}
