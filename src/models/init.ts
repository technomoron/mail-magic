import fs from 'fs';
import path from 'path';

import nunjucks from 'nunjucks';
import { z } from 'zod';

import { mailStore } from '../store/store';
import { StoredFile } from '../types';
import { user_and_domain } from '../util';

import { api_domain, api_domain_schema } from './domain';
import { api_form_schema, api_form_type, upsert_form } from './form';
import { api_template_schema, api_template_type, upsert_template } from './template';
import { api_user, api_user_schema } from './user';

interface LoadedTemplate {
	html: string;
	assets: StoredFile[];
}

const init_data_schema = z.object({
	user: z.array(api_user_schema).default([]),
	domain: z.array(api_domain_schema).default([]),
	template: z.array(api_template_schema).default([]),
	form: z.array(api_form_schema).default([])
});

type InitData = z.infer<typeof init_data_schema>;

/**
 * Resolve an asset file within ./config/<userid>/<domain>/<type>/assets
 */
function resolveAsset(
	basePath: string,
	type: 'form-templates' | 'tx-templates',
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
		type: 'form-templates' | 'tx-templates';
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

class DebugLoader extends nunjucks.FileSystemLoader {
	getSource(name: string) {
		console.log('[Nunjucks] trying to resolve include:', name);
		const src = super.getSource(name);
		if (!src) {
			console.warn('[Nunjucks] include not found:', name);
		} else {
			console.log('[Nunjucks] resolved include:', src.path);
		}
		return src;
	}
}

function createEnvForUser(store: mailStore, user: api_user) {
	const userBasePath = path.join(store.configpath, user.idname);

	class ProtectingLoader extends DebugLoader {
		getSource(name: string) {
			console.log('[Nunjucks] trying to resolve include:', name);
			const src = super.getSource(name);
			if (!src) {
				console.warn('[Nunjucks] include not found:', name);
				return src;
			} else {
				console.log('[Nunjucks] resolved include:', src.path);
				// Apply variable protection to the included content
				const protectedSrc = {
					...src,
					src: env.getFilter('protect_variables')(src.src) as string
				};
				return protectedSrc;
			}
		}
	}

	const env = new nunjucks.Environment(
		new ProtectingLoader(userBasePath, {
			noCache: true,
			watch: false
		}),
		{
			autoescape: true,
			trimBlocks: true,
			lstripBlocks: true
		}
	);

	// const re = /(\{%(?!\s*block|\s*endblock|\s*extends|\s*include)[\s\S]*?%\})/g;
	const re = /(\{%(?!\s*block|\s*endblock|\s*extends|\s*include|\s*import)[\s\S]*?%\})/g;

	env.addFilter('protect_variables', (content: string) => {
		console.log(`CONTENT BEFORE: ${content}`);
		const out = content
			.replace(/(\{\{[\s\S]*?\}\})/g, (m) => `<!--VAR:${Buffer.from(m).toString('base64')}-->`)
			.replace(
				/(\{%(?!\s*block|\s*endblock|\s*extends|\s*include|\s*import)[\s\S]*?%\})/g,
				(m) => `<!--FLOW:${Buffer.from(m).toString('base64')}-->`
			);
		console.log(`CONTENT AFTER: ${out}`);
		return out;
	});

	/*
	env.addFilter('protect_variables', (content: string) => {
		console.log(`CONTENT BEFORE: ${content}`);
		const out = content
			.replace(/(\{\{[\s\S]*?\}\})/g, (m) => `<!--VAR:${Buffer.from(m).toString('base64')}-->`)
			.replace(re, (m) => `< !--FLOW: ${Buffer.from(m).toString('base64')}-- >`);
		console.log(`CONTENT AFTER: ${out}`);
		return out;
	});
*/
	env.addFilter('restore_variables', (content: string) => {
		return content
			.replace(/<!--VAR:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'))
			.replace(/<!--FLOW:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'));
	});

	return env;
}

async function _load_template(
	store: mailStore,
	filename: string,
	pathname: string,
	user: api_user,
	domain: api_domain,
	locale: string | null,
	type: 'form-templates' | 'tx-templates'
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

	const loader = createEnvForUser(store, user);
	const raw = fs.readFileSync(absPath, 'utf8');
	if (!raw.trim()) {
		throw new Error(`Template file "${absPath}" is empty`);
	}

	try {
		// Protect variables in the main template
		const protectedTpl = loader.getFilter('protect_variables')(raw) as string;
		const relName = path.relative(rootDir, absPath);

		// Process includes/extends - the loader will protect variables in included files
		const merged = (loader as any).renderString(protectedTpl, {}, { path: relName });

		// Restore all variables in the final merged template
		const restored = loader.getFilter('restore_variables')(merged) as string;

		const { html, assets } = extractAndReplaceAssets(restored, {
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

	return _load_template(store, form.filename, '', user, domain, locale, 'form-templates');
}

export async function loadTxTemplate(store: mailStore, template: api_template_type): Promise<LoadedTemplate> {
	const { user, domain } = await user_and_domain(template.domain_id);
	const locale = template.locale || domain.locale || user.locale || null;

	return _load_template(store, template.filename, '', user, domain, locale, 'tx-templates');
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

		if (records.user) {
			store.print_debug('Creating user records');
			for (const record of records.user) {
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
					await fixed.update({ template: html, assets });
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
