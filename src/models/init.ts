import fs from 'fs';
import path from 'path';

import nunjucks from 'nunjucks';
import { Sequelize } from 'sequelize';
import { z } from 'zod';

import { mailStore } from '../store/store';
import { StoredFile } from '../types';
import { user_and_domain } from '../util';

import { api_domain, api_domain_schema } from './domain';
import { api_form_schema, api_form_type, upsert_form } from './form';
import { api_template_schema, api_template_type, upsert_template } from './template';
import { api_user, api_user_schema } from './user';

export interface LoadedTemplate {
	html: string;
	assets: StoredFile[];
}

export const init_data_schema = z.object({
	user: z.array(api_user_schema).default([]),
	domain: z.array(api_domain_schema).default([]),
	template: z.array(api_template_schema).default([]),
	form: z.array(api_form_schema).default([])
});

function resolveAsset(
	basePath: string,
	type: 'form-templates' | 'tx-templates',
	domainName: string | null,
	locale: string | null,
	assetName: string
): string | null {
	const searchPaths: string[] = [];

	if (domainName && locale) {
		searchPaths.push(path.join(domainName, type, locale));
	}
	if (domainName) {
		searchPaths.push(path.join(domainName, type));
	}
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
		type: 'form-templates' | 'tx-templates';
		domainName?: string | null;
		locale?: string | null;
		apiUrl: string;
		idname: string;
	}
): { html: string; assets: StoredFile[] } {
	const regex = /src=["']asset\(['"]([^'"]+)['"](?:,\s*(true|false|[01]))?\)["']/g;

	const assets: StoredFile[] = [];

	const replacedHtml = html.replace(regex, (_m, relPath: string, inlineFlag?: string) => {
		console.log('relPath:', relPath, 'inlineFlag:', inlineFlag);

		const fullPath = resolveAsset(opts.basePath, opts.type, opts.domainName ?? null, opts.locale ?? null, relPath);
		if (!fullPath) throw new Error(`Missing asset "${relPath}"`);

		const isInline = inlineFlag === 'true' || inlineFlag === '1';
		const storedFile: StoredFile = {
			filename: relPath,
			path: fullPath,
			cid: isInline ? relPath : undefined
		};

		assets.push(storedFile);
		console.log(`PUSHED ${JSON.stringify(storedFile)}`);

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
	locale: string,
	type: 'form-templates' | 'tx-templates'
): Promise<LoadedTemplate> {
	const nunjucksEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader(pathname), {
		autoescape: true,
		noCache: true
	});

	const fname = path.isAbsolute(filename) ? filename : path.join(pathname, filename);
	store.print_debug(`Attempting to load template "${fname}"`);

	if (!fs.existsSync(fname)) {
		throw new Error(`Missing template file "${fname}"`);
	}
	const content = fs.readFileSync(fname, 'utf-8');
	if (!content || !content.trim()) {
		throw new Error(`Template file "${fname}" is empty`);
	}

	try {
		const relName = path.relative(pathname, fname);
		const merged = nunjucksEnv.render(relName, {});
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
		throw new Error(`Template "${fname}" failed to render: ${(err as Error).message}`);
	}
}

export async function loadFormTemplate(store: mailStore, form: api_form_type): Promise<LoadedTemplate> {
	const { user, domain } = await user_and_domain(form.domain_id);
	const locale = form.locale || domain.locale || user.locale || '';

	return _load_template(store, form.filename, store.env.CONFIG_PATH, user, domain, locale, 'form-templates');
}

export async function loadTxTemplate(store: mailStore, template: api_template_type): Promise<LoadedTemplate> {
	const { user, domain } = await user_and_domain(template.domain_id);
	const locale = template.locale || domain.locale || user.locale || '';

	return _load_template(store, template.filename, store.env.CONFIG_PATH, user, domain, locale, 'tx-templates');
}

export type InitData = z.infer<typeof init_data_schema>;

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
		// console.log(JSON.stringify(records, undefined, 2));

		if (records.user) {
			for (const record of records.user) {
				store.print_debug('Creating user records');
				await api_user.upsert(record);
			}
		}
		if (records.domain) {
			store.print_debug('Creating domain records');
			for (const record of records.domain) {
				await api_domain.upsert(record);
			}
		}
		if (records.template) {
			store.print_debug('Creating template records');
			for (const record of records.template) {
				const fixed = await upsert_template(record);
				if (!fixed.template) {
					const { html, assets } = await loadTxTemplate(store, fixed);
					fixed.update({ template: html, assets });
				}
			}
		}
		if (records.form) {
			store.print_debug('Creating form records');
			for (const record of records.form) {
				const fixed = await upsert_form(record);
				if (!fixed.template) {
					const { html, assets } = await loadFormTemplate(store, fixed);
					fixed.update({ template: html, files: assets });
				}
			}
		}
		store.print_debug('Initdata upserted successfully.');
	} else {
		store.print_debug(`No init data file, trying ${initfile}`);
	}
}
