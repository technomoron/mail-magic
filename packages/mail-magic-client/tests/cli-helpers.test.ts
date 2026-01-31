import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, it, vi } from 'vitest';

import { pushTemplate, pushTemplateDir } from '../src/cli-helpers';

function setupTemplateFixture(): { root: string; templates: string; cssPath: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-'));
	const templates = path.join(root, 'templates');
	const partials = path.join(templates, 'partials');
	fs.mkdirSync(partials, { recursive: true });

	fs.writeFileSync(path.join(templates, 'base.njk'), '<html><body>{% block body %}{% endblock %}</body></html>');
	fs.writeFileSync(path.join(partials, 'header.njk'), '<h1>{{ title }}</h1>');
	fs.writeFileSync(
		path.join(templates, 'welcome.njk'),
		'{% extends "base.njk" %}{% block body %}{% include "partials/header.njk" %}Hi{% endblock %}'
	);

	const cssPath = path.join(templates, 'foundation-emails.css');
	fs.writeFileSync(cssPath, 'h1 { color: #111; }');

	return { root, templates, cssPath };
}

it('pushes a compiled template with inlined partials', async () => {
	const fixture = setupTemplateFixture();
	const storeTxTemplate = vi.fn(async () => ({ Status: 'OK' }));

	const summary = await pushTemplate(
		{
			api: 'http://localhost:3000',
			token: 'test-token',
			domain: 'example.test',
			template: 'welcome',
			input: fixture.templates,
			css: fixture.cssPath
		},
		{ storeTxTemplate }
	);

	expect(storeTxTemplate).toHaveBeenCalledTimes(1);
	const payload = storeTxTemplate.mock.calls[0][0];
	expect(payload.name).toBe('welcome');
	expect(payload.domain).toBe('example.test');
	expect(payload.template).toMatch(/<h1[^>]*>\s*\{\{\s*title\s*\}\}\s*<\/h1>/);
	expect(payload.template).not.toContain('{% include');
	expect(summary.name).toBe('welcome');
	expect(summary.domain).toBe('example.test');

	fs.rmSync(fixture.root, { recursive: true, force: true });
});

it('pushes a config-style directory with templates and assets', async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-config-'));
	const domain = 'alpha.example.test';
	const domainDir = path.join(root, domain);
	const txRoot = path.join(domainDir, 'tx-template');
	const formRoot = path.join(domainDir, 'form-template');
	const assetsRoot = path.join(domainDir, 'assets', 'images');
	const txLocaleRoot = path.join(txRoot, 'en');
	const formLocaleRoot = path.join(formRoot, 'en');
	const partialsRoot = path.join(txRoot, 'partials');

	fs.mkdirSync(txLocaleRoot, { recursive: true });
	fs.mkdirSync(formLocaleRoot, { recursive: true });
	fs.mkdirSync(assetsRoot, { recursive: true });
	fs.mkdirSync(partialsRoot, { recursive: true });

	fs.writeFileSync(path.join(txRoot, 'base.njk'), '<html><body>{% block body %}{% endblock %}</body></html>');
	fs.writeFileSync(path.join(partialsRoot, 'header.njk'), '<h1>{{ title }}</h1>');
	fs.writeFileSync(
		path.join(txLocaleRoot, 'welcome.njk'),
		'{% extends "base.njk" %}{% block body %}{% include "partials/header.njk" %}Hi{% endblock %}'
	);
	fs.writeFileSync(path.join(formLocaleRoot, 'contact.njk'), '<p>Contact {{ name }}</p>');
	fs.writeFileSync(path.join(txRoot, 'foundation-emails.css'), 'h1 { color: #111; }');
	fs.writeFileSync(path.join(assetsRoot, 'logo.png'), 'logo');
	fs.mkdirSync(path.join(txLocaleRoot, 'images'), { recursive: true });
	fs.writeFileSync(path.join(txLocaleRoot, 'images', 'hero.png'), 'hero');

	const initData = {
		domain: [{ domain_id: 1, name: domain, locale: 'en' }],
		template: [
			{
				domain_id: 1,
				name: 'welcome',
				locale: 'en',
				sender: 'Alpha <noreply@alpha.example.test>',
				subject: 'Welcome'
			}
		],
		form: [
			{
				domain_id: 1,
				idname: 'contact',
				locale: 'en',
				sender: 'Forms <forms@alpha.example.test>',
				recipient: 'owner@alpha.example.test',
				subject: 'Contact',
				secret: 'shh'
			}
		]
	};

	fs.writeFileSync(path.join(root, 'init-data.json'), JSON.stringify(initData, null, 2));

	const storeTxTemplate = vi.fn(async () => ({ Status: 'OK' }));
	const storeFormTemplate = vi.fn(async () => ({ Status: 'OK' }));
	const uploadAssets = vi.fn(async () => ({ Status: 'OK' }));

	await pushTemplateDir(
		{
			api: 'http://localhost:3000',
			token: 'test-token',
			input: root,
			domain
		},
		{ storeTxTemplate, storeFormTemplate, uploadAssets }
	);

	expect(storeTxTemplate).toHaveBeenCalledTimes(1);
	expect(storeFormTemplate).toHaveBeenCalledTimes(1);
	expect(uploadAssets).toHaveBeenCalledTimes(2);

	const txPayload = storeTxTemplate.mock.calls[0][0];
	expect(txPayload.name).toBe('welcome');
	expect(txPayload.domain).toBe(domain);
	expect(txPayload.locale).toBe('en');

	const formPayload = storeFormTemplate.mock.calls[0][0];
	expect(formPayload.idname).toBe('contact');
	expect(formPayload.domain).toBe(domain);
	expect(formPayload.locale).toBe('en');

	const domainAssetsCall = uploadAssets.mock.calls.find((call) => !call[0].templateType);
	expect(domainAssetsCall).toBeTruthy();
	if (domainAssetsCall) {
		expect(domainAssetsCall[0].path).toBe('images');
	}
	const templateAssetsCall = uploadAssets.mock.calls.find((call) => call[0].templateType === 'tx');
	expect(templateAssetsCall).toBeTruthy();
	if (templateAssetsCall) {
		expect(templateAssetsCall[0].template).toBe('welcome');
		expect(templateAssetsCall[0].locale).toBe('en');
		expect(templateAssetsCall[0].path).toBe('images');
	}

	fs.rmSync(root, { recursive: true, force: true });
});

it('reports planned uploads in dry-run mode', async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-dryrun-'));
	const domain = 'alpha.example.test';
	const domainDir = path.join(root, domain);
	const txRoot = path.join(domainDir, 'tx-template', 'en');

	fs.mkdirSync(txRoot, { recursive: true });
	fs.writeFileSync(path.join(txRoot, 'welcome.njk'), '<p>Hello</p>');

	const initData = {
		domain: [{ domain_id: 1, name: domain, locale: 'en' }],
		template: [
			{
				domain_id: 1,
				name: 'welcome',
				locale: 'en',
				sender: 'Alpha <noreply@alpha.example.test>',
				subject: 'Welcome'
			}
		],
		form: []
	};

	fs.writeFileSync(path.join(root, 'init-data.json'), JSON.stringify(initData, null, 2));

	const storeTxTemplate = vi.fn(async () => ({ Status: 'OK' }));
	const storeFormTemplate = vi.fn(async () => ({ Status: 'OK' }));
	const uploadAssets = vi.fn(async () => ({ Status: 'OK' }));

	const summary = await pushTemplateDir(
		{
			api: 'http://localhost:3000',
			token: 'test-token',
			input: root,
			domain,
			dryRun: true
		},
		{ storeTxTemplate, storeFormTemplate, uploadAssets }
	);

	expect(storeTxTemplate).not.toHaveBeenCalled();
	expect(storeFormTemplate).not.toHaveBeenCalled();
	expect(uploadAssets).not.toHaveBeenCalled();
	expect(summary.templates).toBe(1);
	expect(summary.forms).toBe(0);
	expect(summary.actions.some((action) => action.kind === 'tx-template')).toBe(true);

	fs.rmSync(root, { recursive: true, force: true });
});

it('skips uploads for single-template dry runs', async () => {
	const fixture = setupTemplateFixture();
	const storeTxTemplate = vi.fn(async () => ({ Status: 'OK' }));

	const summary = await pushTemplate(
		{
			api: 'http://localhost:3000',
			token: 'test-token',
			domain: 'example.test',
			template: 'welcome',
			input: fixture.templates,
			css: fixture.cssPath,
			dryRun: true
		},
		{ storeTxTemplate }
	);

	expect(storeTxTemplate).not.toHaveBeenCalled();
	expect(summary.name).toBe('welcome');

	fs.rmSync(fixture.root, { recursive: true, force: true });
});
