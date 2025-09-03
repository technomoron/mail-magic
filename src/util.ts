import fs from 'fs';
import path from 'path';

import nunjucks from 'nunjucks';

import { mailStore } from './store/store';

/**
 * Normalize a string into a safe identifier for slugs, filenames, etc.
 *
 * - Lowercases all characters
 * - Replaces any character that is not `a-z`, `0-9`, `-`, or `_` with `-`
 * - Collapses multiple consecutive dashes into one
 * - Trims leading and trailing dashes
 *
 * Examples:
 *   normalizeSlug("Hello World!")    -> "hello-world"
 *   normalizeSlug("  Áccêntš  ")     -> "ccnt"
 *   normalizeSlug("My--Slug__Test")  -> "my-slug__test"
 */
export function normalizeSlug(input: string): string {
	if (!input) {
		return '';
	}
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_]/g, '-')
		.replace(/--+/g, '-') // collapse multiple dashes
		.replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}

// Validate template syntax, return unrendered source on success.

async function _load_template(store: mailStore, filename: string, pathname: string): Promise<string> {
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
		nunjucksEnv.renderString(content, {});
	} catch (err) {
		throw new Error(`Template "${fname}" failed to render: ${(err as Error).message}`);
	}
	return content;
}

export async function loadFormTemplate(store: mailStore, name: string): Promise<string> {
	const pathname = path.join(store.configpath, 'form-templates');
	return await _load_template(store, name, pathname);
}

export async function loadTxTemplate(store: mailStore, name: string): Promise<string> {
	const pathname = path.join(store.configpath, 'tx-templates');
	return await _load_template(store, name, pathname);
}
