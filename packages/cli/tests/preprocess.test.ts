import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compileTemplate } from '../src/shared-template-preprocess';

describe('preprocess config isolation', () => {
	const cleanupDirs: string[] = [];

	afterEach(() => {
		for (const dir of cleanupDirs.splice(0, cleanupDirs.length)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('does not leak inline_includes config across invocations', async () => {
		const templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-preprocess-'));
		cleanupDirs.push(templateRoot);

		fs.writeFileSync(path.join(templateRoot, 'main.njk'), '{% include "missing.njk" %}');

		const withoutInlining = await compileTemplate({
			src_dir: templateRoot,
			tplname: 'main',
			inline_includes: false
		});
		expect(withoutInlining).toContain('{% include "missing.njk" %}');

		await expect(
			compileTemplate({
				src_dir: templateRoot,
				tplname: 'main'
			})
			).rejects.toThrow('Include not found: missing.njk');
	});

	it('applies child block overrides across multi-level extends chains', async () => {
		const templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-preprocess-extends-'));
		cleanupDirs.push(templateRoot);

		fs.writeFileSync(path.join(templateRoot, 'base.njk'), '<html><body>{% block body %}BASE{% endblock %}</body></html>');
		fs.writeFileSync(
			path.join(templateRoot, 'layout.njk'),
			'{% extends "base.njk" %}{% block body %}<section>{% block content %}LAYOUT{% endblock %}</section>{% endblock %}'
		);
		fs.writeFileSync(
			path.join(templateRoot, 'page.njk'),
			'{% extends "layout.njk" %}{% block content %}<p>CHILD</p>{% endblock %}'
		);

		const compiled = await compileTemplate({
			src_dir: templateRoot,
			tplname: 'page',
			inline_includes: false
		});

		expect(compiled).toContain('<p>CHILD</p>');
		expect(compiled).not.toContain('LAYOUT');
	});
});
