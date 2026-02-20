import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRoute } from './util/route.js';
function replacePrefix(input, from, to) {
    if (input === from) {
        return to;
    }
    if (input.startsWith(`${from}/`)) {
        const suffix = input.slice(from.length);
        if (to === '/') {
            return suffix.replace(/^\/+/, '/') || '/';
        }
        return `${to}${suffix}`;
    }
    return input;
}
function rewriteSpecForRuntime(spec, opts) {
    if (!spec || typeof spec !== 'object') {
        return spec;
    }
    const base = normalizeRoute(opts.apiBasePath, '/api');
    const asset = normalizeRoute(opts.assetRoute, '/asset');
    const root = spec;
    const out = { ...root };
    // Keep the spec stable while still reflecting the configured public URL and base paths.
    out.servers = [{ url: String(opts.apiUrl || ''), description: 'Configured API_URL' }];
    const rawPaths = root.paths;
    if (!rawPaths || typeof rawPaths !== 'object') {
        return out;
    }
    const rewritten = {};
    for (const [p, v] of Object.entries(rawPaths)) {
        let next = String(p);
        next = replacePrefix(next, '/api', base);
        next = replacePrefix(next, '/asset', asset);
        // Normalize double slashes after prefix replacement (path only, not URLs).
        next = next.replace(/\/{2,}/g, '/');
        rewritten[next] = v;
    }
    out.paths = rewritten;
    return out;
}
let cachedSpec = null;
let cachedSpecError = null;
function loadPackagedOpenApiSpec() {
    if (cachedSpec || cachedSpecError) {
        return cachedSpec;
    }
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const candidate = path.resolve(here, '../docs/swagger/openapi.json');
        const raw = fs.readFileSync(candidate, 'utf8');
        cachedSpec = JSON.parse(raw);
        return cachedSpec;
    }
    catch (err) {
        cachedSpecError = err instanceof Error ? err.message : String(err);
        return null;
    }
}
export function installMailMagicSwagger(server, opts) {
    const rawPath = typeof opts.swaggerPath === 'string' ? opts.swaggerPath.trim() : '';
    const enabled = Boolean(opts.swaggerEnabled) || rawPath.length > 0;
    if (!enabled) {
        return;
    }
    const base = normalizeRoute(opts.apiBasePath, '/api');
    const resolved = rawPath.length > 0 ? rawPath : `${base}/swagger`;
    const mount = normalizeRoute(resolved, `${base}/swagger`);
    // Mount under the API router so it runs before the API 404 handler.
    server.useExpress(mount, (req, res, next) => {
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }
        const spec = loadPackagedOpenApiSpec();
        if (!spec) {
            res.status(500).json({
                success: false,
                code: 500,
                message: `Swagger spec is unavailable${cachedSpecError ? `: ${cachedSpecError}` : ''}`,
                data: null,
                errors: {}
            });
            return;
        }
        res.status(200).json(rewriteSpecForRuntime(spec, {
            apiBasePath: base,
            assetRoute: opts.assetRoute,
            apiUrl: opts.apiUrl
        }));
    });
}
