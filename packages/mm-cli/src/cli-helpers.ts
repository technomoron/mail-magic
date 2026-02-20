import fs from 'node:fs';
import path from 'node:path';

import TemplateClient from '@technomoron/mail-magic-client';

import { compileTemplate } from './shared-template-preprocess';

export interface PushTemplateOptions {
	api: string;
	token: string;
	domain: string;
	template: string;
	name?: string;
	locale?: string;
	sender?: string;
	subject?: string;
	input?: string;
	css?: string;
	dryRun?: boolean;
}

export interface TemplateUploader {
	storeTxTemplate: (payload: {
		template: string;
		domain: string;
		name?: string;
		locale?: string;
		sender?: string;
		subject?: string;
	}) => Promise<unknown>;
}

export type PushTemplateSummary = {
	domain: string;
	name: string;
	locale?: string;
	sender?: string;
	subject?: string;
	filePath: string;
};

export interface TemplateDirUploader extends TemplateUploader {
	storeFormTemplate: (payload: {
		idname: string;
		domain: string;
		template: string;
		sender: string;
		recipient: string;
		subject?: string;
		locale?: string;
		secret?: string;
	}) => Promise<unknown>;
	uploadAssets: (payload: {
		domain: string;
		files: string[];
		templateType?: 'tx' | 'form';
		template?: string;
		locale?: string;
		path?: string;
	}) => Promise<unknown>;
}

export type UploadAction = {
	kind: 'tx-template' | 'form-template' | 'domain-assets' | 'template-assets';
	domain: string;
	template?: string;
	locale?: string;
	path?: string;
	files?: string[];
};

export type PushTemplateDirSummary = {
	templates: number;
	forms: number;
	assetBatches: number;
	actions: UploadAction[];
};

type InitDomain = {
	domain_id: number;
	name: string;
	locale?: string;
};

type InitTemplate = {
	domain_id: number;
	name: string;
	locale?: string;
	sender?: string;
	subject?: string;
	filename?: string;
};

type InitForm = {
	domain_id: number;
	idname: string;
	locale?: string;
	sender: string;
	recipient: string;
	subject?: string;
	secret?: string;
	filename?: string;
};

type InitData = {
	domain?: InitDomain[];
	template?: InitTemplate[];
	form?: InitForm[];
};

type NormalizedTemplate = {
	name: string;
	nameSlug: string;
	locale: string;
	localeSlug: string;
};

function resolveTemplateName(template: string, inputDir: string): string {
	const cleaned = template.replace(/\\/g, '/');
	const inputRoot = path.resolve(inputDir);
	if (path.isAbsolute(template)) {
		const templateAbs = path.resolve(template);
		const relative = path.relative(inputRoot, templateAbs);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(`Template must be under input directory: ${template}`);
		}
		const withoutExt = relative.endsWith('.njk') ? relative.slice(0, -4) : relative;
		return withoutExt.replace(/\\/g, '/');
	}
	return cleaned.endsWith('.njk') ? cleaned.slice(0, -4) : cleaned;
}

function normalizeSlug(input: string): string {
	if (!input) {
		return '';
	}
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_\.]/g, '-')
		.replace(/--+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function loadInitData(rootDir: string): InitData {
	const initPath = path.join(rootDir, 'init-data.json');
	if (!fs.existsSync(initPath)) {
		throw new Error(`init-data.json not found in ${rootDir}`);
	}
	const raw = fs.readFileSync(initPath, 'utf8');
	const data = JSON.parse(raw) as InitData;
	return {
		domain: data.domain ?? [],
		template: data.template ?? [],
		form: data.form ?? []
	};
}

function collectFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) {
		return [];
	}
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(fullPath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function resolveTemplateFile(
	typeRoot: string,
	domainName: string,
	type: 'tx-template' | 'form-template',
	nameSlug: string,
	localeSlug: string,
	filename?: string
): { tplname: string; filePath: string } {
	let tplname = '';
	if (filename) {
		const cleaned = filename.replace(/\\/g, '/');
		const prefix = `${domainName}/${type}/`;
		if (cleaned.startsWith(prefix)) {
			tplname = cleaned.slice(prefix.length);
		} else if (cleaned.startsWith(`${type}/`)) {
			tplname = cleaned.slice(type.length + 1);
		} else {
			tplname = cleaned;
		}
		if (tplname.endsWith('.njk')) {
			tplname = tplname.slice(0, -4);
		}
	} else {
		tplname = localeSlug ? path.join(localeSlug, nameSlug) : nameSlug;
	}
	const filePath = path.join(typeRoot, `${tplname}.njk`);
	return { tplname: tplname.replace(/\\/g, '/'), filePath };
}

function resolveCssPath(rootDir: string, domainDir: string, typeRoot: string, override?: string): string {
	if (override) {
		return override;
	}
	const candidates = [
		path.join(typeRoot, 'foundation-emails.css'),
		path.join(domainDir, 'foundation-emails.css'),
		path.join(rootDir, 'foundation-emails.css')
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return '';
}

function selectTemplateForAsset(
	templates: NormalizedTemplate[],
	localeSlug: string,
	templateSlug: string | null
): NormalizedTemplate | null {
	if (!templates.length) {
		return null;
	}
	const byLocale = localeSlug
		? templates.filter((template) => template.localeSlug === localeSlug)
		: templates.filter((template) => !template.localeSlug);
	const candidates = byLocale.length ? byLocale : templates;
	if (templateSlug) {
		const exact = candidates.find((template) => template.nameSlug === templateSlug);
		if (exact) {
			return exact;
		}
	}
	return candidates[0] ?? null;
}

async function uploadDomainAssets(
	uploader: TemplateDirUploader,
	domainName: string,
	assetsRoot: string,
	options: { dryRun: boolean; inputRoot: string; actions: UploadAction[] }
): Promise<void> {
	const files = collectFiles(assetsRoot);
	const grouped = new Map<string, string[]>();
	for (const file of files) {
		const relDir = path.relative(assetsRoot, path.dirname(file));
		const key = relDir === '.' ? '' : relDir.split(path.sep).join('/');
		const current = grouped.get(key) ?? [];
		current.push(file);
		grouped.set(key, current);
	}

	for (const [subdir, fileList] of grouped.entries()) {
		if (options.dryRun) {
			options.actions.push({
				kind: 'domain-assets',
				domain: domainName,
				path: subdir || undefined,
				files: fileList.map((file) => path.relative(options.inputRoot, file))
			});
			continue;
		}
		await uploader.uploadAssets({
			domain: domainName,
			files: fileList,
			path: subdir || undefined
		});
	}
}

async function uploadTemplateAssets(
	uploader: TemplateDirUploader,
	domainName: string,
	type: 'tx' | 'form',
	typeRoot: string,
	templates: NormalizedTemplate[],
	options: { dryRun: boolean; inputRoot: string; actions: UploadAction[] }
): Promise<void> {
	const files = collectFiles(typeRoot).filter((file) => {
		if (file.endsWith('.njk')) {
			return false;
		}
		return path.basename(file) !== 'foundation-emails.css';
	});
	if (!files.length) {
		return;
	}

	const grouped = new Map<string, { template: NormalizedTemplate; path: string; files: string[] }>();

	for (const file of files) {
		const rel = path.relative(typeRoot, file);
		const parts = rel.split(path.sep).filter(Boolean);
		if (!parts.length) {
			continue;
		}
		let localeSlug = '';
		let templateSlug: string | null = null;

		if (parts.length && templates.some((template) => template.localeSlug === parts[0])) {
			localeSlug = parts.shift() || '';
		}
		if (parts.length && templates.some((template) => template.nameSlug === parts[0])) {
			templateSlug = parts.shift() || null;
		}

		const template = selectTemplateForAsset(templates, localeSlug, templateSlug);
		if (!template) {
			continue;
		}

		const relDirParts = parts.slice(0, -1);
		const relDir = relDirParts.length ? relDirParts.join('/') : '';
		const key = `${template.name}|${template.locale}|${relDir}`;
		const entry = grouped.get(key) ?? { template, path: relDir, files: [] };
		entry.files.push(file);
		grouped.set(key, entry);
	}

	for (const entry of grouped.values()) {
		if (options.dryRun) {
			options.actions.push({
				kind: 'template-assets',
				domain: domainName,
				template: entry.template.name,
				locale: entry.template.locale,
				path: entry.path || undefined,
				files: entry.files.map((file) => path.relative(options.inputRoot, file))
			});
			continue;
		}
		await uploader.uploadAssets({
			domain: domainName,
			files: entry.files,
			templateType: type,
			template: entry.template.name,
			locale: entry.template.locale,
			path: entry.path || undefined
		});
	}
}

export async function pushTemplate(
	options: PushTemplateOptions,
	client?: TemplateUploader
): Promise<PushTemplateSummary> {
	if (!options.template) {
		throw new Error('Template name is required');
	}
	if (!options.domain) {
		throw new Error('Domain is required');
	}
	if (!options.api || !options.token) {
		throw new Error('API URL and token are required');
	}

	const inputDir = options.input ?? './templates';
	const cssPath = options.css ?? path.join(inputDir, 'foundation-emails.css');
	const tplname = resolveTemplateName(options.template, inputDir);
	const inputRoot = path.resolve(inputDir);
	const templateFile = path.join(inputRoot, `${tplname}.njk`);

	if (!fs.existsSync(templateFile)) {
		throw new Error(`Template file not found: ${templateFile}`);
	}

	const compiled = await compileTemplate({
		src_dir: inputDir,
		css_path: cssPath,
		tplname
	});

	const name = options.name ?? path.basename(tplname);
	const summary: PushTemplateSummary = {
		domain: options.domain,
		name,
		locale: options.locale,
		sender: options.sender,
		subject: options.subject,
		filePath: templateFile
	};

	if (!options.dryRun) {
		const uploader = client ?? new TemplateClient(options.api, options.token);
		await uploader.storeTxTemplate({
			template: compiled,
			domain: options.domain,
			name,
			locale: options.locale,
			sender: options.sender,
			subject: options.subject
		});
	}

	return summary;
}

export interface PushTemplateDirOptions {
	api: string;
	token: string;
	input?: string;
	domain?: string;
	css?: string;
	includeTx?: boolean;
	includeForms?: boolean;
	includeAssets?: boolean;
	dryRun?: boolean;
}

export interface CompileConfigTreeOptions {
	input?: string;
	output?: string;
	domain?: string;
	css?: string;
	includeTx?: boolean;
	includeForms?: boolean;
}

export type CompileAction = {
	kind: 'tx-template' | 'form-template';
	domain: string;
	template: string;
	locale?: string;
	sourcePath: string;
	outputPath: string;
};

export type CompileConfigTreeSummary = {
	templates: number;
	forms: number;
	actions: CompileAction[];
};

export async function compileConfigTree(options: CompileConfigTreeOptions): Promise<CompileConfigTreeSummary> {
	const inputRoot = path.resolve(options.input ?? './data');
	const outputRoot = path.resolve(options.output ?? './compiled');
	const initData = loadInitData(inputRoot);
	const domains = initData.domain ?? [];
	if (!domains.length) {
		throw new Error('No domains found in init-data.json');
	}

	const requestedDomain = options.domain;
	const domainNames = requestedDomain ? [requestedDomain] : domains.length === 1 ? [domains[0].name] : [];

	if (!domainNames.length) {
		throw new Error('Domain is required when init-data.json contains multiple domains');
	}

	const includeTx = options.includeTx ?? true;
	const includeForms = options.includeForms ?? true;
	const actions: CompileAction[] = [];

	for (const domainName of domainNames) {
		const domainRecord = domains.find((domain) => domain.name === domainName);
		if (!domainRecord) {
			throw new Error(`Domain "${domainName}" not found in init-data.json`);
		}

		const domainDir = path.join(inputRoot, domainName);
		if (!fs.existsSync(domainDir)) {
			throw new Error(`Domain directory not found: ${domainDir}`);
		}

		const domainLocale = domainRecord.locale || '';

		const txTemplates = (initData.template ?? []).filter(
			(template) => template.domain_id === domainRecord.domain_id
		);
		const formTemplates = (initData.form ?? []).filter((form) => form.domain_id === domainRecord.domain_id);

		if (includeTx) {
			const txRoot = path.join(domainDir, 'tx-template');
			const cssPath = resolveCssPath(inputRoot, domainDir, txRoot, options.css);
			for (const template of txTemplates) {
				const localeValue = template.locale || domainLocale || '';
				const localeSlug = normalizeSlug(localeValue);
				const nameSlug = normalizeSlug(template.name);
				const resolved = resolveTemplateFile(
					txRoot,
					domainName,
					'tx-template',
					nameSlug,
					localeSlug,
					template.filename
				);
				if (!fs.existsSync(resolved.filePath)) {
					throw new Error(`Template file not found: ${resolved.filePath}`);
				}
				const compiled = await compileTemplate({
					src_dir: txRoot,
					css_path: cssPath,
					tplname: resolved.tplname
				});
				const outputPath = path.join(outputRoot, domainName, 'tx-template', `${resolved.tplname}.njk`);
				fs.mkdirSync(path.dirname(outputPath), { recursive: true });
				fs.writeFileSync(outputPath, compiled);
				actions.push({
					kind: 'tx-template',
					domain: domainName,
					template: template.name,
					locale: localeValue,
					sourcePath: resolved.filePath,
					outputPath
				});
			}
		}

		if (includeForms) {
			const formRoot = path.join(domainDir, 'form-template');
			const cssPath = resolveCssPath(inputRoot, domainDir, formRoot, options.css);
			for (const form of formTemplates) {
				const localeValue = form.locale || domainLocale || '';
				const localeSlug = normalizeSlug(localeValue);
				const nameSlug = normalizeSlug(form.idname);
				const resolved = resolveTemplateFile(
					formRoot,
					domainName,
					'form-template',
					nameSlug,
					localeSlug,
					form.filename
				);
				if (!fs.existsSync(resolved.filePath)) {
					throw new Error(`Form template file not found: ${resolved.filePath}`);
				}
				const compiled = await compileTemplate({
					src_dir: formRoot,
					css_path: cssPath,
					tplname: resolved.tplname
				});
				const outputPath = path.join(outputRoot, domainName, 'form-template', `${resolved.tplname}.njk`);
				fs.mkdirSync(path.dirname(outputPath), { recursive: true });
				fs.writeFileSync(outputPath, compiled);
				actions.push({
					kind: 'form-template',
					domain: domainName,
					template: form.idname,
					locale: localeValue,
					sourcePath: resolved.filePath,
					outputPath
				});
			}
		}
	}

	const templates = actions.filter((action) => action.kind === 'tx-template').length;
	const forms = actions.filter((action) => action.kind === 'form-template').length;
	return { templates, forms, actions };
}

export async function pushTemplateDir(
	options: PushTemplateDirOptions,
	client?: TemplateDirUploader
): Promise<PushTemplateDirSummary> {
	if (!options.api || !options.token) {
		throw new Error('API URL and token are required');
	}

	const inputRoot = path.resolve(options.input ?? './data');
	const initData = loadInitData(inputRoot);
	const domains = initData.domain ?? [];
	if (!domains.length) {
		throw new Error('No domains found in init-data.json');
	}

	const requestedDomain = options.domain;
	const domainNames = requestedDomain ? [requestedDomain] : domains.length === 1 ? [domains[0].name] : [];

	if (!domainNames.length) {
		throw new Error('Domain is required when init-data.json contains multiple domains');
	}

	const includeTx = options.includeTx ?? true;
	const includeForms = options.includeForms ?? true;
	const includeAssets = options.includeAssets ?? true;
	const dryRun = options.dryRun ?? false;

	const uploader = client ?? new TemplateClient(options.api, options.token);
	const actions: UploadAction[] = [];

	for (const domainName of domainNames) {
		const domainRecord = domains.find((domain) => domain.name === domainName);
		if (!domainRecord) {
			throw new Error(`Domain "${domainName}" not found in init-data.json`);
		}

		const domainDir = path.join(inputRoot, domainName);
		if (!fs.existsSync(domainDir)) {
			throw new Error(`Domain directory not found: ${domainDir}`);
		}

		const domainLocale = domainRecord.locale || '';

		const txTemplates = (initData.template ?? []).filter(
			(template) => template.domain_id === domainRecord.domain_id
		);
		const formTemplates = (initData.form ?? []).filter((form) => form.domain_id === domainRecord.domain_id);

		const normalizedTx = txTemplates.map((template) => {
			const localeValue = template.locale || domainLocale || '';
			return {
				name: template.name,
				nameSlug: normalizeSlug(template.name),
				locale: localeValue,
				localeSlug: normalizeSlug(localeValue)
			};
		});
		const normalizedForms = formTemplates.map((form) => {
			const localeValue = form.locale || domainLocale || '';
			return {
				name: form.idname,
				nameSlug: normalizeSlug(form.idname),
				locale: localeValue,
				localeSlug: normalizeSlug(localeValue)
			};
		});

		if (includeTx) {
			const txRoot = path.join(domainDir, 'tx-template');
			const cssPath = resolveCssPath(inputRoot, domainDir, txRoot, options.css);
			for (const template of txTemplates) {
				const localeValue = template.locale || domainLocale || '';
				const localeSlug = normalizeSlug(localeValue);
				const nameSlug = normalizeSlug(template.name);
				const resolved = resolveTemplateFile(
					txRoot,
					domainName,
					'tx-template',
					nameSlug,
					localeSlug,
					template.filename
				);
				if (!fs.existsSync(resolved.filePath)) {
					throw new Error(`Template file not found: ${resolved.filePath}`);
				}
				const compiled = await compileTemplate({
					src_dir: txRoot,
					css_path: cssPath,
					tplname: resolved.tplname
				});
				actions.push({
					kind: 'tx-template',
					domain: domainName,
					template: template.name,
					locale: localeValue
				});
				if (!dryRun) {
					await uploader.storeTxTemplate({
						template: compiled,
						domain: domainName,
						name: template.name,
						locale: localeValue,
						sender: template.sender,
						subject: template.subject
					});
				}
			}
		}

		if (includeForms) {
			const formRoot = path.join(domainDir, 'form-template');
			const cssPath = resolveCssPath(inputRoot, domainDir, formRoot, options.css);
			for (const form of formTemplates) {
				const localeValue = form.locale || domainLocale || '';
				const localeSlug = normalizeSlug(localeValue);
				const nameSlug = normalizeSlug(form.idname);
				const resolved = resolveTemplateFile(
					formRoot,
					domainName,
					'form-template',
					nameSlug,
					localeSlug,
					form.filename
				);
				if (!fs.existsSync(resolved.filePath)) {
					throw new Error(`Form template file not found: ${resolved.filePath}`);
				}
				const compiled = await compileTemplate({
					src_dir: formRoot,
					css_path: cssPath,
					tplname: resolved.tplname
				});
				actions.push({
					kind: 'form-template',
					domain: domainName,
					template: form.idname,
					locale: localeValue
				});
				if (!dryRun) {
					await uploader.storeFormTemplate({
						idname: form.idname,
						domain: domainName,
						template: compiled,
						sender: form.sender,
						recipient: form.recipient,
						subject: form.subject,
						locale: localeValue,
						secret: form.secret
					});
				}
			}
		}

		if (includeAssets) {
			const assetsRoot = path.join(domainDir, 'assets');
			if (fs.existsSync(assetsRoot)) {
				await uploadDomainAssets(uploader, domainName, assetsRoot, {
					dryRun,
					inputRoot,
					actions
				});
			}

			const txRoot = path.join(domainDir, 'tx-template');
			if (fs.existsSync(txRoot)) {
				await uploadTemplateAssets(uploader, domainName, 'tx', txRoot, normalizedTx, {
					dryRun,
					inputRoot,
					actions
				});
			}

			const formRoot = path.join(domainDir, 'form-template');
			if (fs.existsSync(formRoot)) {
				await uploadTemplateAssets(uploader, domainName, 'form', formRoot, normalizedForms, {
					dryRun,
					inputRoot,
					actions
				});
			}
		}
	}

	const templates = actions.filter((action) => action.kind === 'tx-template').length;
	const forms = actions.filter((action) => action.kind === 'form-template').length;
	const assetBatches = actions.filter((action) => action.kind.includes('assets')).length;

	return { templates, forms, assetBatches, actions };
}
