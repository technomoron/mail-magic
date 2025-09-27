import fs from 'fs';
import path from 'path';

import { Unyuck } from '@technomoron/unyuck';
import { z } from 'zod';

import { mailStore } from '../store/store.js';
import { StoredFile } from '../types.js';
import { user_and_domain } from '../util.js';

import { api_domain, api_domain_schema } from './domain.js';
import { api_form_schema, api_form_type, upsert_form } from './form.js';
import { api_txmail_schema, api_txmail_type, upsert_txmail } from './txmail.js';
import { api_user, api_user_schema } from './user.js';

interface LoadedTemplate {
	html: string;
	assets: StoredFile[];
}

const init_data_schema = z.object({
	user: z.array(api_user_schema).default([]),
	domain: z.array(api_domain_schema).default([]),
	template: z.array(api_txmail_schema).default([]),
	form: z.array(api_form_schema).default([])
});

type InitData = z.infer<typeof init_data_schema>;

/**
 * Resolve an asset file within ./config/<userid>/<domain>/<type>/assets
 */
function resolveAsset(
	basePath: string,
	type: 'form-template' | 'tx-template',
	domainName: string,
	assetName: string,
	locale?: string | null
): string | null {
	const searchPaths: string[] = [];

	// always domain-scoped
	if (locale) {
		searchPaths.push(path.join(domainName, type, locale));
	}
	searchPaths.push(path.join(domainName, type));

	// no domain fallback → do not leak assets between domains
	// but allow locale fallbacks inside type
	if (locale) {
		searchPaths.push(path.join(type, locale));
	}
	searchPaths.push(type);

	for (const p of searchPaths) {
		const candidate = path.join(basePath, p, 'assets', assetName);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function extractAndReplaceAssets(
	html: string,
	opts: {
		basePath: string;
		type: 'form-template' | 'tx-template';
		domainName: string;
		locale?: string | null;
		apiUrl: string;
		idname: string;
	}
): { html: string; assets: StoredFile[] } {
	const regex = /src=["']asset\(['"]([^'"]+)['"](?:,\s*(true|false|[01]))?\)["']/g;

	const assets: StoredFile[] = [];

	const replacedHtml = html.replace(regex, (_m, relPath: string, inlineFlag?: string) => {
		const fullPath = resolveAsset(opts.basePath, opts.type, opts.domainName, relPath, opts.locale ?? undefined);
		if (!fullPath) {
			throw new Error(`Missing asset "${relPath}"`);
		}

		const isInline = inlineFlag === 'true' || inlineFlag === '1';
		const storedFile: StoredFile = {
			filename: relPath,
			path: fullPath,
			cid: isInline ? relPath : undefined
		};

		assets.push(storedFile);

		return isInline
			? `src="cid:${relPath}"`
			: `src="${opts.apiUrl}/image/${opts.idname}/${opts.type}/` +
					`${opts.domainName ? opts.domainName + '/' : ''}` +
					`${opts.locale ? opts.locale + '/' : ''}` +
					relPath +
					'"';
	});

	return { html: replacedHtml, assets };
}

async function _load_template(
	store: mailStore,
	filename: string,
	pathname: string,
	user: api_user,
	domain: api_domain,
	locale: string | null,
	type: 'form-template' | 'tx-template'
): Promise<LoadedTemplate> {
	const rootDir = path.join(store.configpath, user.idname, domain.name, type);

	let relFile = filename;
	const prefix = path.join(user.idname, domain.name, type) + path.sep;
	if (filename.startsWith(prefix)) {
		relFile = filename.slice(prefix.length);
	}

	const absPath = path.resolve(rootDir, pathname || '', relFile);

	if (!absPath.startsWith(rootDir)) {
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
		const baseUserPath = path.join(store.configpath, user.idname);
		const templateKey = path.relative(baseUserPath, absPath);
		if (!templateKey) {
			throw new Error(`Unable to resolve template path for "${absPath}"`);
		}

		const processor = new Unyuck({ basePath: baseUserPath });
		const merged = processor.flattenNoAssets(templateKey);

		const { html, assets } = extractAndReplaceAssets(merged, {
			basePath: path.join(store.configpath, user.idname),
			type,
			domainName: domain.name,
			locale,
			apiUrl: store.env.API_URL,
			idname: user.idname
		});

		return { html, assets };
	} catch (err) {
		throw new Error(`Template "${absPath}" failed to preprocess: ${(err as Error).message}`);
	}
}
export async function loadFormTemplate(store: mailStore, form: api_form_type): Promise<LoadedTemplate> {
	const { user, domain } = await user_and_domain(form.domain_id);
	const locale = form.locale || domain.locale || user.locale || null;

	return _load_template(store, form.filename, '', user, domain, locale, 'form-template');
}

export async function loadTxTemplate(store: mailStore, template: api_txmail_type): Promise<LoadedTemplate> {
	const { user, domain } = await user_and_domain(template.domain_id);
	const locale = template.locale || domain.locale || user.locale || null;

	return _load_template(store, template.filename, '', user, domain, locale, 'tx-template');
}

export async function importData(store: mailStore) {
	const initfile = path.join(store.configpath, 'init-data.json');
	if (fs.existsSync(initfile)) {
		store.print_debug(`Loading init data from ${initfile}`);
		const data = await fs.promises.readFile(initfile, 'utf8');

		let records: InitData;
		try {
			records = init_data_schema.parse(JSON.parse(data));
		} catch (err) {
			store.print_debug(`Invalid init-data.json: ${err}`);
			return;
		}

		const pendingUserDomains: Array<{ user_id: number; domain: number }> = [];
		if (records.user) {
			store.print_debug('Creating user records');
			for (const record of records.user) {
				const { domain, ...userWithoutDomain } = record;

				await api_user.upsert({ ...userWithoutDomain, domain: null });
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
	} else {
		store.print_debug(`No init data file, tried ${initfile}`);
	}
}
