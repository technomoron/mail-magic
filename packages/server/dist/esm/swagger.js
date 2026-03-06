import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_MAGIC_SWAGGER_PATH } from './util/route.js';
function rewriteSpecForRuntime(spec, opts) {
    if (!spec || typeof spec !== 'object') {
        return spec;
    }
    const root = spec;
    const out = { ...root };
    // Keep the spec stable while still reflecting the configured public URL.
    out.servers = [{ url: String(opts.apiUrl || ''), description: 'Configured API_URL' }];
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
    catch {
        cachedSpecError = 'Failed to load OpenAPI spec';
        return null;
    }
}
export function installMailMagicSwagger(server, opts) {
    if (!opts.swaggerEnabled) {
        return;
    }
    // Mount under the API router so it runs before the API 404 handler.
    server.useExpress(MAIL_MAGIC_SWAGGER_PATH, (req, res, next) => {
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
            apiUrl: opts.apiUrl
        }));
    });
}
