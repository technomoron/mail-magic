"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushTemplate = pushTemplate;
exports.pushTemplateDir = pushTemplateDir;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const mail_magic_client_1 = __importDefault(require("./mail-magic-client"));
const preprocess_1 = require("./preprocess");
function resolveTemplateName(template, inputDir) {
    const cleaned = template.replace(/\\/g, '/');
    const inputRoot = node_path_1.default.resolve(inputDir);
    if (node_path_1.default.isAbsolute(template)) {
        const templateAbs = node_path_1.default.resolve(template);
        const relative = node_path_1.default.relative(inputRoot, templateAbs);
        if (relative.startsWith('..') || node_path_1.default.isAbsolute(relative)) {
            throw new Error(`Template must be under input directory: ${template}`);
        }
        const withoutExt = relative.endsWith('.njk') ? relative.slice(0, -4) : relative;
        return withoutExt.replace(/\\/g, '/');
    }
    return cleaned.endsWith('.njk') ? cleaned.slice(0, -4) : cleaned;
}
function normalizeSlug(input) {
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
function loadInitData(rootDir) {
    const initPath = node_path_1.default.join(rootDir, 'init-data.json');
    if (!node_fs_1.default.existsSync(initPath)) {
        throw new Error(`init-data.json not found in ${rootDir}`);
    }
    const raw = node_fs_1.default.readFileSync(initPath, 'utf8');
    const data = JSON.parse(raw);
    return {
        domain: data.domain ?? [],
        template: data.template ?? [],
        form: data.form ?? []
    };
}
function collectFiles(dir) {
    if (!node_fs_1.default.existsSync(dir)) {
        return [];
    }
    const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = node_path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(fullPath));
        }
        else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}
function resolveTemplateFile(typeRoot, domainName, type, nameSlug, localeSlug, filename) {
    let tplname = '';
    if (filename) {
        const cleaned = filename.replace(/\\/g, '/');
        const prefix = `${domainName}/${type}/`;
        if (cleaned.startsWith(prefix)) {
            tplname = cleaned.slice(prefix.length);
        }
        else if (cleaned.startsWith(`${type}/`)) {
            tplname = cleaned.slice(type.length + 1);
        }
        else {
            tplname = cleaned;
        }
        if (tplname.endsWith('.njk')) {
            tplname = tplname.slice(0, -4);
        }
    }
    else {
        tplname = localeSlug ? node_path_1.default.join(localeSlug, nameSlug) : nameSlug;
    }
    const filePath = node_path_1.default.join(typeRoot, `${tplname}.njk`);
    return { tplname: tplname.replace(/\\/g, '/'), filePath };
}
function resolveCssPath(rootDir, domainDir, typeRoot, override) {
    if (override) {
        return override;
    }
    const candidates = [
        node_path_1.default.join(typeRoot, 'foundation-emails.css'),
        node_path_1.default.join(domainDir, 'foundation-emails.css'),
        node_path_1.default.join(rootDir, 'foundation-emails.css')
    ];
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return '';
}
function selectTemplateForAsset(templates, localeSlug, templateSlug) {
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
async function uploadDomainAssets(uploader, domainName, assetsRoot, options) {
    const files = collectFiles(assetsRoot);
    const grouped = new Map();
    for (const file of files) {
        const relDir = node_path_1.default.relative(assetsRoot, node_path_1.default.dirname(file));
        const key = relDir === '.' ? '' : relDir.split(node_path_1.default.sep).join('/');
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
                files: fileList.map((file) => node_path_1.default.relative(options.inputRoot, file))
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
async function uploadTemplateAssets(uploader, domainName, type, typeRoot, templates, options) {
    const files = collectFiles(typeRoot).filter((file) => {
        if (file.endsWith('.njk')) {
            return false;
        }
        return node_path_1.default.basename(file) !== 'foundation-emails.css';
    });
    if (!files.length) {
        return;
    }
    const grouped = new Map();
    for (const file of files) {
        const rel = node_path_1.default.relative(typeRoot, file);
        const parts = rel.split(node_path_1.default.sep).filter(Boolean);
        if (!parts.length) {
            continue;
        }
        let localeSlug = '';
        let templateSlug = null;
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
                files: entry.files.map((file) => node_path_1.default.relative(options.inputRoot, file))
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
async function pushTemplate(options, client) {
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
    const cssPath = options.css ?? node_path_1.default.join(inputDir, 'foundation-emails.css');
    const tplname = resolveTemplateName(options.template, inputDir);
    const inputRoot = node_path_1.default.resolve(inputDir);
    const templateFile = node_path_1.default.join(inputRoot, `${tplname}.njk`);
    if (!node_fs_1.default.existsSync(templateFile)) {
        throw new Error(`Template file not found: ${templateFile}`);
    }
    const compiled = await (0, preprocess_1.compileTemplate)({
        src_dir: inputDir,
        css_path: cssPath,
        tplname
    });
    const name = options.name ?? node_path_1.default.basename(tplname);
    const summary = {
        domain: options.domain,
        name,
        locale: options.locale,
        sender: options.sender,
        subject: options.subject,
        filePath: templateFile
    };
    if (!options.dryRun) {
        const uploader = client ?? new mail_magic_client_1.default(options.api, options.token);
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
async function pushTemplateDir(options, client) {
    if (!options.api || !options.token) {
        throw new Error('API URL and token are required');
    }
    const inputRoot = node_path_1.default.resolve(options.input ?? './data');
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
    const uploader = client ?? new mail_magic_client_1.default(options.api, options.token);
    const actions = [];
    for (const domainName of domainNames) {
        const domainRecord = domains.find((domain) => domain.name === domainName);
        if (!domainRecord) {
            throw new Error(`Domain "${domainName}" not found in init-data.json`);
        }
        const domainDir = node_path_1.default.join(inputRoot, domainName);
        if (!node_fs_1.default.existsSync(domainDir)) {
            throw new Error(`Domain directory not found: ${domainDir}`);
        }
        const domainLocale = domainRecord.locale || '';
        const txTemplates = (initData.template ?? []).filter((template) => template.domain_id === domainRecord.domain_id);
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
            const txRoot = node_path_1.default.join(domainDir, 'tx-template');
            const cssPath = resolveCssPath(inputRoot, domainDir, txRoot, options.css);
            for (const template of txTemplates) {
                const localeValue = template.locale || domainLocale || '';
                const localeSlug = normalizeSlug(localeValue);
                const nameSlug = normalizeSlug(template.name);
                const resolved = resolveTemplateFile(txRoot, domainName, 'tx-template', nameSlug, localeSlug, template.filename);
                if (!node_fs_1.default.existsSync(resolved.filePath)) {
                    throw new Error(`Template file not found: ${resolved.filePath}`);
                }
                const compiled = await (0, preprocess_1.compileTemplate)({
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
            const formRoot = node_path_1.default.join(domainDir, 'form-template');
            const cssPath = resolveCssPath(inputRoot, domainDir, formRoot, options.css);
            for (const form of formTemplates) {
                const localeValue = form.locale || domainLocale || '';
                const localeSlug = normalizeSlug(localeValue);
                const nameSlug = normalizeSlug(form.idname);
                const resolved = resolveTemplateFile(formRoot, domainName, 'form-template', nameSlug, localeSlug, form.filename);
                if (!node_fs_1.default.existsSync(resolved.filePath)) {
                    throw new Error(`Form template file not found: ${resolved.filePath}`);
                }
                const compiled = await (0, preprocess_1.compileTemplate)({
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
            const assetsRoot = node_path_1.default.join(domainDir, 'assets');
            if (node_fs_1.default.existsSync(assetsRoot)) {
                await uploadDomainAssets(uploader, domainName, assetsRoot, {
                    dryRun,
                    inputRoot,
                    actions
                });
            }
            const txRoot = node_path_1.default.join(domainDir, 'tx-template');
            if (node_fs_1.default.existsSync(txRoot)) {
                await uploadTemplateAssets(uploader, domainName, 'tx', txRoot, normalizedTx, {
                    dryRun,
                    inputRoot,
                    actions
                });
            }
            const formRoot = node_path_1.default.join(domainDir, 'form-template');
            if (node_fs_1.default.existsSync(formRoot)) {
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
