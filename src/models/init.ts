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
 * Resolve an asset file within ./config/<domain>/assets
 */
function resolveAsset(basePath: string, domainName: string, assetName: string): string | null {
	const assetsRoot = path.join(basePath, domainName, 'assets');
	if (!fs.existsSync(assetsRoot)) {
		return null;
	}
	const resolvedRoot = path.resolve(assetsRoot);
	const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
	const candidate = path.resolve(assetsRoot, assetName);
	if (!candidate.startsWith(normalizedRoot)) {
		return null;
	}
	if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
		return candidate;
	}
	return null;
}

function buildAssetUrl(baseUrl: string, route: string, domainName: string, assetPath: string): string {
	const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
	const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
	const encodedDomain = encodeURIComponent(domainName);
	const encodedPath = assetPath
		.split('/')
		.filter((segment) => segment.length > 0)
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	const trailing = encodedPath ? `/${encodedPath}` : '';
	return `${trimmedBase}${normalizedRoute}/${encodedDomain}${trailing}`;
}

function extractAndReplaceAssets(
	html: string,
	opts: {
		basePath: string;
		domainName: string;
		apiUrl: string;
		assetRoute: string;
	}
): { html: string; assets: StoredFile[] } {
	const regex = /src=["']asset\(['"]([^'"]+)['"](?:,\s*(true|false|[01]))?\)["']/g;

	const assets: StoredFile[] = [];

	const replacedHtml = html.replace(regex, (_m, relPath: string, inlineFlag?: string) => {
		const fullPath = resolveAsset(opts.basePath, opts.domainName, relPath);
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

		if (isInline) {
			return `src="cid:${relPath}"`;
		}

		const domainAssetsRoot = path.join(opts.basePath, opts.domainName, 'assets');
		const relativeToAssets = path.relative(domainAssetsRoot, fullPath);
		if (!relativeToAssets || relativeToAssets.startsWith('..')) {
			throw new Error(`Asset path escapes domain assets directory: ${fullPath}`);
		}
		const normalizedAssetPath = relativeToAssets.split(path.sep).join('/');
		const assetUrl = buildAssetUrl(opts.apiUrl, opts.assetRoute, opts.domainName, normalizedAssetPath);
		return `src="${assetUrl}"`;
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
	const rootDir = path.join(store.configpath, domain.name, type);

	let relFile = filename;
	const prefix = path.join(domain.name, type) + path.sep;
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
		const baseConfigPath = store.configpath;
		const templateKey = path.relative(baseConfigPath, absPath);
		if (!templateKey) {
			throw new Error(`Unable to resolve template path for "${absPath}"`);
		}

		const processor = new Unyuck({ basePath: baseConfigPath });
		const merged = processor.flattenNoAssets(templateKey);

		const { html, assets } = extractAndReplaceAssets(merged, {
			basePath: baseConfigPath,
			domainName: domain.name,
			apiUrl: store.env.API_URL,
			assetRoute: store.env.ASSET_ROUTE
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
