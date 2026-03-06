import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAIL_MAGIC_SWAGGER_PATH } from './util/route.js';

import type { mailApiServer } from './server.js';
import type { ApiRequest, ExtendedReq } from '@technomoron/api-server-base';

type ApiRes = ApiRequest['res'];

type SwaggerInstallOptions = {
	apiUrl: string;
	swaggerEnabled?: boolean;
};

function rewriteSpecForRuntime(spec: unknown, opts: { apiUrl: string }): unknown {
	if (!spec || typeof spec !== 'object') {
		return spec;
	}

	const root = spec as Record<string, unknown>;
	const out: Record<string, unknown> = { ...root };

	// Keep the spec stable while still reflecting the configured public URL.
	out.servers = [{ url: String(opts.apiUrl || ''), description: 'Configured API_URL' }];

	return out;
}

let cachedSpec: unknown | null = null;
let cachedSpecError: string | null = null;

function loadPackagedOpenApiSpec(): unknown | null {
	if (cachedSpec || cachedSpecError) {
		return cachedSpec;
	}

	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		const candidate = path.resolve(here, '../docs/swagger/openapi.json');
		const raw = fs.readFileSync(candidate, 'utf8');
		cachedSpec = JSON.parse(raw) as unknown;
		return cachedSpec;
	} catch {
		cachedSpecError = 'Failed to load OpenAPI spec';
		return null;
	}
}

export function installMailMagicSwagger(server: mailApiServer, opts: SwaggerInstallOptions): void {
	if (!opts.swaggerEnabled) {
		return;
	}

	// Mount under the API router so it runs before the API 404 handler.
	server.useExpress(MAIL_MAGIC_SWAGGER_PATH, (req: ExtendedReq, res: ApiRes, next: (error?: unknown) => void) => {
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

		res.status(200).json(
			rewriteSpecForRuntime(spec, {
				apiUrl: opts.apiUrl
			})
		);
	});
}
