"use strict";
/*
 *  Merge templates in source dir using nunjucks blocks and layouts.
 *  Preserve flow control and variable expansion for later dynamic data.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.do_the_template_thing = do_the_template_thing;
exports.compileTemplate = compileTemplate;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const cheerio_1 = require("cheerio");
const juice_1 = __importDefault(require("juice"));
const nunjucks_1 = __importDefault(require("nunjucks"));
function createCompileCfg(options) {
    return {
        env: null,
        src_dir: options.src_dir ?? 'templates',
        dist_dir: options.dist_dir ?? 'templates-dist',
        css_path: options.css_path ?? node_path_1.default.join(process.cwd(), 'templates', 'foundation-emails.css'),
        css_content: null,
        inline_includes: options.inline_includes ?? true
    };
}
function resolvePathRoot(dir) {
    return node_path_1.default.isAbsolute(dir) ? dir : node_path_1.default.join(process.cwd(), dir);
}
function resolveCssPath(cssPath) {
    if (!cssPath) {
        return '';
    }
    return node_path_1.default.isAbsolute(cssPath) ? cssPath : node_path_1.default.join(process.cwd(), cssPath);
}
function inlineIncludes(content, baseDir, srcRoot, normalizedSrcRoot, stack) {
    const includeExp = /\{%\s*include\s+['"]([^'"]+)['"][^%]*%\}/g;
    return content.replace(includeExp, (_match, includePath) => {
        const cleaned = includePath.replace(/^\/+/, '');
        const candidates = [node_path_1.default.resolve(baseDir, cleaned), node_path_1.default.resolve(srcRoot, cleaned)];
        const found = candidates.find((candidate) => node_fs_1.default.existsSync(candidate));
        if (!found) {
            throw new Error(`Include not found: ${includePath}`);
        }
        const resolved = node_fs_1.default.realpathSync(found);
        if (!resolved.startsWith(normalizedSrcRoot)) {
            throw new Error(`Include path escapes template root: ${includePath}`);
        }
        if (!node_fs_1.default.statSync(resolved).isFile()) {
            throw new Error(`Include is not a file: ${includePath}`);
        }
        if (stack.has(resolved)) {
            throw new Error(`Circular include detected for ${includePath}`);
        }
        stack.add(resolved);
        const raw = node_fs_1.default.readFileSync(resolved, 'utf8');
        const inlined = inlineIncludes(raw, node_path_1.default.dirname(resolved), srcRoot, normalizedSrcRoot, stack);
        stack.delete(resolved);
        return inlined;
    });
}
class PreprocessExtension {
    constructor(cfg) {
        this.tags = ['process_layout'];
        this.cfg = cfg;
    }
    parse(parser, nodes) {
        const token = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(token.value);
        return new nodes.CallExtension(this, 'run', args);
    }
    run(_context, tplname) {
        const template = this.cfg.env.getTemplate(tplname);
        const src = template.tmplStr;
        const extmatch = src.match(/\{%\s*extends\s+['"]([^'"]+)['"]\s*%\}/);
        if (!extmatch)
            return src;
        const layoutName = extmatch[1];
        const layoutTemplate = this.cfg.env.getTemplate(layoutName);
        const layoutSrc = layoutTemplate.tmplStr;
        const blocks = {};
        const blockexp = /\{%\s*block\s+([a-zA-Z0-9_]+)\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/g;
        let match;
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
function process_template(cfg, tplname, writeOutput = true) {
    console.log(`Processing template: ${tplname}`);
    try {
        const srcRoot = resolvePathRoot(cfg.src_dir);
        const resolvedSrcRoot = node_fs_1.default.realpathSync(srcRoot);
        const normalizedSrcRoot = resolvedSrcRoot.endsWith(node_path_1.default.sep) ? resolvedSrcRoot : resolvedSrcRoot + node_path_1.default.sep;
        const templateFile = node_path_1.default.join(srcRoot, `${tplname}.njk`);
        // 1) Resolve template inheritance
        const mergedTemplate = cfg.env.renderString(`{% process_layout "${tplname}.njk" %}`, {});
        // 1.5) Inline partials/includes so the server doesn't need a loader
        const mergedWithPartials = cfg.inline_includes
            ? inlineIncludes(mergedTemplate, node_path_1.default.dirname(templateFile), srcRoot, normalizedSrcRoot, new Set())
            : mergedTemplate;
        // 2) Protect variables/flow
        const protectedTemplate = cfg.env.filters.protect_variables(mergedWithPartials);
        // 3) Light HTML transforms for email compatibility
        console.log('Processing HTML for email compatibility');
        let processedHtml = protectedTemplate;
        try {
            const $ = (0, cheerio_1.load)(protectedTemplate, {
                xmlMode: false
                // decodeEntities: false
            });
            // <container> -> <table>
            $('container').each((_index, element) => {
                const $container = $(element);
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
            $('row').each((_index, element) => {
                const $row = $(element);
                const background = $row.attr('background') || '';
                const $tr = $('<tr/>').attr({ class: $row.attr('class') || '' });
                if (background)
                    $tr.css('background', background);
                $tr.append($row.contents());
                $row.replaceWith($tr);
            });
            // <columns> -> <td>
            $('columns').each((_index, element) => {
                const $columns = $(element);
                const padding = $columns.attr('padding') || '0';
                const $td = $('<td/>').attr({
                    class: $columns.attr('class') || '',
                    style: `padding: ${padding};`
                });
                $td.append($columns.contents());
                $columns.replaceWith($td);
            });
            // <button> -> <a>
            $('button').each((_index, element) => {
                const $button = $(element);
                const href = $button.attr('href') || '#';
                const buttonClass = $button.attr('class') || '';
                const $a = $('<a/>').attr({
                    href,
                    class: buttonClass,
                    style: $button.attr('style') ||
                        'display: inline-block; padding: 8px 16px; border-radius: 3px; text-decoration: none;'
                });
                $a.append($button.contents());
                $button.replaceWith($a);
            });
            processedHtml = $.html();
            console.log('HTML processing complete');
        }
        catch (htmlError) {
            console.error('HTML processing error:', htmlError);
            processedHtml = protectedTemplate;
        }
        // 4) Inline CSS
        let inlinedHtml;
        try {
            inlinedHtml = (0, juice_1.default)(processedHtml, {
                extraCss: cfg.css_content ?? undefined,
                removeStyleTags: false,
                preserveMediaQueries: true,
                preserveFontFaces: true
            });
        }
        catch (juiceError) {
            console.error('CSS inlining error:', juiceError);
            inlinedHtml = processedHtml;
        }
        // 5) Restore variables/flow
        const finalHtml = cfg.env.filters.restore_variables(inlinedHtml);
        // Write
        if (writeOutput) {
            const distRoot = resolvePathRoot(cfg.dist_dir);
            const outputPath = node_path_1.default.join(distRoot, `${tplname}.njk`);
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(outputPath), { recursive: true });
            node_fs_1.default.writeFileSync(outputPath, finalHtml);
        }
        if (writeOutput) {
            console.log(`Created ${tplname}.njk`);
        }
        return finalHtml;
    }
    catch (error) {
        console.error(`Error processing ${tplname}:`, error);
        throw error;
    }
}
function get_all_files(dir, filelist = []) {
    const files = node_fs_1.default.readdirSync(dir);
    files.forEach((file) => {
        const file_path = node_path_1.default.join(dir, file);
        if (node_fs_1.default.statSync(file_path).isDirectory()) {
            get_all_files(file_path, filelist);
        }
        else {
            filelist.push(file_path);
        }
    });
    return filelist;
}
function find_templates(cfg) {
    const srcRoot = resolvePathRoot(cfg.src_dir);
    const all = get_all_files(srcRoot);
    return all
        .filter((file) => file.endsWith('.njk'))
        .filter((file) => {
        const basename = node_path_1.default.basename(file);
        const content = node_fs_1.default.readFileSync(file, 'utf8');
        return (!basename.startsWith('_') &&
            !basename.includes('layout') &&
            !basename.includes('part') &&
            content.includes('{% extends'));
    })
        .map((file) => {
        const name = node_path_1.default.relative(srcRoot, file);
        return name.substring(0, name.length - 4);
    });
}
async function process_all_templates(cfg) {
    const distRoot = resolvePathRoot(cfg.dist_dir);
    if (!node_fs_1.default.existsSync(distRoot)) {
        node_fs_1.default.mkdirSync(distRoot, { recursive: true });
    }
    const templates = find_templates(cfg);
    console.log(`Found ${templates.length} templates to process: ${templates.join(', ')}`);
    for (const template of templates) {
        try {
            process_template(cfg, template);
        }
        catch (error) {
            console.error(`Failed to process ${template}:`, error);
        }
    }
    console.log('All templates processed!');
}
function init_env(cfg) {
    const loader = new nunjucks_1.default.FileSystemLoader(resolvePathRoot(cfg.src_dir));
    cfg.env = new nunjucks_1.default.Environment(loader, { autoescape: false });
    if (!cfg.env)
        throw Error('Unable to init nunjucks environment');
    // Load CSS if present
    const cssPath = resolveCssPath(cfg.css_path);
    if (cssPath && node_fs_1.default.existsSync(cssPath)) {
        cfg.css_content = node_fs_1.default.readFileSync(cssPath, 'utf8');
    }
    else {
        cfg.css_content = null;
    }
    // Extension
    cfg.env.addExtension('PreprocessExtension', new PreprocessExtension(cfg));
    // Filters
    cfg.env.addFilter('protect_variables', function (content) {
        return content
            .replace(/(\{\{[\s\S]*?\}\})/g, (m) => `<!--VAR:${Buffer.from(m).toString('base64')}-->`)
            .replace(/(\{%(?!\s*block|\s*endblock|\s*extends)[\s\S]*?%\})/g, (m) => {
            return `<!--FLOW:${Buffer.from(m).toString('base64')}-->`;
        });
    });
    cfg.env.addFilter('restore_variables', function (content) {
        return content
            .replace(/<!--VAR:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'))
            .replace(/<!--FLOW:(.*?)-->/g, (_m, enc) => Buffer.from(enc, 'base64').toString('utf8'));
    });
}
async function do_the_template_thing(options = {}) {
    const cfg = createCompileCfg(options);
    init_env(cfg);
    if (options.tplname) {
        process_template(cfg, options.tplname);
    }
    else {
        await process_all_templates(cfg);
    }
}
async function compileTemplate(options) {
    const cfg = createCompileCfg(options);
    init_env(cfg);
    return process_template(cfg, options.tplname, false);
}
