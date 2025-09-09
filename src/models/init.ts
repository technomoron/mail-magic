import fs from 'fs';
import path from 'path';

import nunjucks from 'nunjucks';

import { mailStore } from '../store/store';
import { user_and_domain } from '../util';

import { api_domain, api_domain_type } from './domain';
import { api_form_type } from './form';
import { api_template_type } from './template';
import { api_user } from './user';

function addAssetFilter(
	nunjucksEnv: nunjucks.Environment,
	opts: {
		store: mailStore;
		idname: string;
		templateType: 'form-templates' | 'tx-templates';
		domainName?: string | null;
		locale?: string | null;
	}
) {
	const { store, idname, templateType, domainName, locale } = opts;
	nunjucksEnv.addFilter('asset', (relPath: string) => {
		const found = resolveAsset(
			path.join(store.configpath, idname),
			templateType,
			domainName ?? null,
			locale ?? null,
			relPath
		);
		if (!found) {
			throw new Error(`Missing asset "${relPath}"`);
		}
		return (
			`${store.env.API_URL}/image/${idname}/${templateType}/` +
			`${domainName ? domainName + '/' : ''}` +
			`${locale ? locale + '/' : ''}` +
			relPath
		);
	});
}

function resolveAsset(
	basePath: string,
	templateType: 'form-templates' | 'tx-templates',
	domainName: string | null,
	locale: string | null,
	assetName: string
): string | null {
	const searchPaths: string[] = [];

	if (domainName && locale) {
		searchPaths.push(path.join(templateType, domainName, locale));
	}
	if (domainName) {
		searchPaths.push(path.join(templateType, domainName));
	}
	if (locale) {
		searchPaths.push(path.join(templateType, locale));
	}
	searchPaths.push(path.join(templateType));

	for (const p of searchPaths) {
		const candidate = path.join(basePath, p, 'assets', assetName);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

// Validate template syntax, return unrendered source on success.

async function _load_template(
	store: mailStore,
	filename: string,
	pathname: string,
	user: api_user,
	domain: api_domain,
	locale: string,
	type: string
): Promise<string> {
	const nunjucksEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader(pathname), {
		autoescape: true,
		noCache: true
	});

	addAssetFilter(nunjucksEnv, {
		store,
		idname: user.idname,
		templateType: 'form-templates',
		domainName: domain.name,
		locale
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
		nunjucksEnv.renderString(content, {});
	} catch (err) {
		throw new Error(`Template "${fname}" failed to render: ${(err as Error).message}`);
	}
	return content;
}

export async function loadFormTemplate(store: mailStore, form: api_form_type): Promise<string> {
	const { user, domain } = await user_and_domain(form.domain_id);

	const locale = form.locale || domain.locale || user.locale || '';

	return _load_template(store, form.filename, store.env.CONFIG_PATH, user, domain, locale, 'form-templates');
}

export async function loadTxTemplate(store: mailStore, template: api_template_type): Promise<string> {
	const { user, domain } = await user_and_domain(template.domain_id);

	const locale = template.locale || domain.locale || user.locale || '';

	return _load_template(store, template.filename, store.env.CONFIG_PATH, user, domain, locale, 'tx-templates');
}
