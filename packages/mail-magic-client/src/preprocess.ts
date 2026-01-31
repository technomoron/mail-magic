/*
 *  Merge templates in source dir using nunjucks blocks and layouts.
 *  Preserve flow control and variable expansion for later dynamic data.
 */

import fs from 'node:fs';
import path from 'node:path';

import { load as loadHtml } from 'cheerio';
import juice from 'juice';
import nunjucks from 'nunjucks';

interface ExtendedTemplate extends nunjucks.Template {
	tmplStr: string;
}

interface ExtendedEnvironment extends nunjucks.Environment {
	filters: {
		[key: string]: (...args: any[]) => any;
		protect_variables: (content: string) => string;
		restore_variables: (content: string) => string;
	};
	getTemplate(name: string, eagerCompile?: boolean): ExtendedTemplate;
}

interface CompileCfg {
	env: ExtendedEnvironment | null;
	src_dir: string;
	dist_dir: string;
	css_path: string;
	css_content: string | null;
	inline_includes: boolean;
}

const cfg: CompileCfg = {
	env: null,
	src_dir: 'templates',
	dist_dir: 'templates-dist',
	css_path: path.join(process.cwd(), 'templates', 'foundation-emails.css'),
	css_content: null,
	inline_includes: true
};

function resolvePathRoot(dir: string): string {
	return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function resolveCssPath(cssPath: string): string {
	if (!cssPath) {
		return '';
	}
	return path.isAbsolute(cssPath) ? cssPath : path.join(process.cwd(), cssPath);
}

function inlineIncludes(content: string, baseDir: string, srcRoot: string, stack: Set<string>): string {
	const includeExp = /\{%\s*include\s+['"]([^'"]+)['"][^%]*%\}/g;
	return content.replace(includeExp, (_match, includePath: string) => {
		const cleaned = includePath.replace(/^\/+/, '');
		const candidates = [path.resolve(baseDir, cleaned), path.resolve(srcRoot, cleaned)];
		const found = candidates.find((candidate) => fs.existsSync(candidate));
		if (!found) {
			throw new Error(`Include not found: ${includePath}`);
		}
		const resolved = fs.realpathSync(found);
		if (stack.has(resolved)) {
			throw new Error(`Circular include detected for ${includePath}`);
		}
		stack.add(resolved);
		const raw = fs.readFileSync(resolved, 'utf8');
		const inlined = inlineIncludes(raw, path.dirname(resolved), srcRoot, stack);
		stack.delete(resolved);
		return inlined;
	});
}

class PreprocessExtension {
	tags: string[] = ['process_layout'];

	// types from nunjucks are not exported for parser/nodes; use any
	parse(parser: any, nodes: any) {
		const token = parser.nextToken();
		const args = parser.parseSignature(null, true);
		parser.advanceAfterBlockEnd(token.value);
		return new nodes.CallExtension(this, 'run', args);
	}

	run(_context: any, tplname: string) {
		const template = cfg.env!.getTemplate(tplname);
		const src = template.tmplStr;

		const extmatch = src.match(/\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}/);
		if (!extmatch) return src;

		const layoutName = extmatch[1];
		const layoutTemplate = cfg.env!.getTemplate(layoutName);
		const layoutSrc = layoutTemplate.tmplStr;

		const blocks: Record<string, string> = {};
		const blockexp = /\{%\s*block\s+([a-zA-Z0-9_]+)\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/g;

		let match: RegExpExecArray | null;
		while ((match = blockexp.exec(src)) !== null) {
			const bname = match[1];
			const bcontent = match[2];
			blocks[bname] = bcontent.trim();
		}

		let merged = layoutSrc;
		for (const [bname, bcontent] of Object.entries(blocks)) {
			const lbexpt = new RegExp(`\\{%\\s*block\\s+${bname}\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}`, 'g');
			merged = merged.replace(lbexpt, bcontent);
		}

		merged = merged.replace(/\{%\s*extends\s+['"][^'"]+['"]\s*%\}/, '');

		if (merged.match(/\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}/)) {
			return this.run(_context, layoutName);
		}

		merged = merged.replace(/\{%\s*block\s+([a-zA-Z0-9_]+)\s*%\}\s*\{%\s*endblock\s*%\}/g, '');

		return merged;
	}
}

function process_template(tplname: string, writeOutput = true) {
	console.log(`Processing template: ${tplname}`);

	try {
		const srcRoot = resolvePathRoot(cfg.src_dir);
		const templateFile = path.join(srcRoot, `${tplname}.njk`);

		// 1) Resolve template inheritance
		const mergedTemplate = cfg.env!.renderString(`{% process_layout "${tplname}.njk" %}`, {});

		// 1.5) Inline partials/includes so the server doesn't need a loader
		const mergedWithPartials = cfg.inline_includes
			? inlineIncludes(mergedTemplate, path.dirname(templateFile), srcRoot, new Set<string>())
			: mergedTemplate;

		// 2) Protect variables/flow
		const protectedTemplate = cfg.env!.filters.protect_variables(mergedWithPartials);

		// 3) Light HTML transforms for email compatibility
		console.log('Processing HTML for email compatibility');

		let processedHtml = protectedTemplate;

		try {
			const $ = loadHtml(protectedTemplate, {
				xmlMode: false
				// decodeEntities: false
			});

			// <container> -> <table>
			$('container').each(function (this: any) {
				const $container = $(this);
				const $table = $('<table/>').attr({
					align: 'center',
					class: $container.attr('class') || '',
					width: '100%',
					cellpadding: '0',
					cellspacing: '0',
					border: '0'
				});
				const $tbody = $('<tbody/>');
				$table.append($tbody);
				$tbody.append($container.contents());
				$container.replaceWith($table);
			});

			// <row> -> <tr>
			$('row').each(function (this: any) {
				const $row = $(this);
				const background = $row.attr('background') || '';
				const $tr = $('<tr/>').attr({ class: $row.attr('class') || '' });
				if (background) $tr.css('background', background);
				$tr.append($row.contents());
				$row.replaceWith($tr);
			});

			// <columns> -> <td>
			$('columns').each(function (this: any) {
				const $columns = $(this);
				const padding = $columns.attr('padding') || '0';
				const $td = $('<td/>').attr({
					class: $columns.attr('class') || '',
					style: `padding: ${padding};`
				});
				$td.append($columns.contents());
				$columns.replaceWith($td);
			});

			// <button> -> <a>
			$('button').each(function (this: any) {
				const $button = $(this);
				const href = $button.attr('href') || '#';
				const buttonClass = $button.attr('class') || '';
				const $a = $('<a/>').attr({
					href,
					class: buttonClass,
					style:
						$button.attr('style') ||
						'display: inline-block; padding: 8px 16px; border-radius: 3px; text-decoration: none;'
				});
				$a.append($button.contents());
				$button.replaceWith($a);
			});

			processedHtml = $.html();
			console.log('HTML processing complete');
		} catch (htmlError) {
			console.error('HTML processing error:', htmlError);
			processedHtml = protectedTemplate;
		}

		// 4) Inline CSS
		let inlinedHtml: string;
		try {
			inlinedHtml = juice(processedHtml, {
				extraCss: cfg.css_content ?? undefined,
				removeStyleTags: false,
				preserveMediaQueries: true,
				preserveFontFaces: true
			});
		} catch (juiceError) {
			console.error('CSS inlining error:', juiceError);
			inlinedHtml = processedHtml;
		}

		// 5) Restore variables/flow
		const finalHtml = cfg.env!.filters.restore_variables(inlinedHtml);

		// Write
		if (writeOutput) {
			const distRoot = resolvePathRoot(cfg.dist_dir);
			const outputPath = path.join(distRoot, `${tplname}.njk`);
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, finalHtml);
		}

		if (writeOutput) {
			console.log(`Created ${tplname}.njk`);
		}
		return finalHtml;
	} catch (error) {
		console.error(`Error processing ${tplname}:`, error);
		throw error;
	}
}

function get_all_files(dir: string, filelist: string[] = []): string[] {
	const files = fs.readdirSync(dir);
	files.forEach((file) => {
		const file_path = path.join(dir, file);
		if (fs.statSync(file_path).isDirectory()) {
			get_all_files(file_path, filelist);
		} else {
			filelist.push(file_path);
		}
	});
	return filelist;
}

function find_templates() {
	const srcRoot = resolvePathRoot(cfg.src_dir);
	const all = get_all_files(srcRoot);

	return all
		.filter((file) => file.endsWith('.njk'))
		.filter((file) => {
			const basename = path.basename(file);
			const content = fs.readFileSync(file, 'utf8');
			return (
				!basename.startsWith('_') &&
				!basename.includes('layout') &&
				!basename.includes('part') &&
				content.includes('{% extends')
			);
		})
		.map((file) => {
			const name = path.relative(srcRoot, file);
			return name.substring(0, name.length - 4);
		});
}

async function process_all_templates() {
	const distRoot = resolvePathRoot(cfg.dist_dir);
	if (!fs.existsSync(distRoot)) {
		fs.mkdirSync(distRoot, { recursive: true });
	}

	const templates = find_templates();
	console.log(`Found ${templates.length} templates to process: ${templates.join(', ')}`);

	for (const template of templates) {
		try {
			process_template(template);
		} catch (error) {
			console.error(`Failed to process ${template}:`, error);
		}
	}
	console.log('All templates processed!');
}

function init_env() {
	const loader = new nunjucks.FileSystemLoader(resolvePathRoot(cfg.src_dir));
	cfg.env = new nunjucks.Environment(loader, { autoescape: false }) as ExtendedEnvironment;
	if (!cfg.env) throw Error('Unable to init nunjucks environment');

	// Load CSS if present
	const cssPath = resolveCssPath(cfg.css_path);
	if (cssPath && fs.existsSync(cssPath)) {
		cfg.css_content = fs.readFileSync(cssPath, 'utf8');
	} else {
		cfg.css_content = null;
	}

	// Extension
	cfg.env.addExtension('PreprocessExtension', new PreprocessExtension());

	// Filters
	cfg.env.addFilter('protect_variables', function (content: string) {
		return content
			.replace(/(\{\{[\s\S]*?\}\})/g, (m) => `<!--VAR:${Buffer.from(m).toString('base64')}-->`)
			.replace(/(\{%(?!\s*block|\s*endblock|\s*extends)[\s\S]*?%\})/g, (m) => {
				return `<!--FLOW:${Buffer.from(m).toString('base64')}-->`;
			});
	});

	cfg.env.addFilter('restore_variables', function (content: string) {
		return content
			.replace(/<!--VAR:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'))
			.replace(/<!--FLOW:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'));
	});
}

export async function do_the_template_thing(
	options: {
		src_dir?: string;
		dist_dir?: string;
		css_path?: string;
		tplname?: string;
		inline_includes?: boolean;
	} = {}
) {
	if (options.src_dir) cfg.src_dir = options.src_dir;
	if (options.dist_dir) cfg.dist_dir = options.dist_dir;
	if (options.css_path) cfg.css_path = options.css_path;
	if (options.inline_includes !== undefined) cfg.inline_includes = options.inline_includes;

	init_env();

	if (options.tplname) {
		process_template(options.tplname);
	} else {
		await process_all_templates();
	}
}

export async function compileTemplate(options: {
	src_dir?: string;
	css_path?: string;
	tplname: string;
	inline_includes?: boolean;
}): Promise<string> {
	if (options.src_dir) cfg.src_dir = options.src_dir;
	if (options.css_path) cfg.css_path = options.css_path;
	if (options.inline_includes !== undefined) cfg.inline_includes = options.inline_includes;

	init_env();

	return process_template(options.tplname, false);
}
