import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { mailApiServer } from './server.js';
import type { NextFunction, Request, Response } from 'express';

type SwaggerInstallOptions = {
	apiBasePath: string;
	assetRoute: string;
	apiUrl: string;
	swaggerEnabled?: boolean;
	swaggerPath?: string;
};

function normalizeRoute(value: string, fallback = ''): string {
	if (!value) {
		return fallback;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}
	const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	if (withLeading === '/') {
		return withLeading;
	}
	return withLeading.replace(/\/+$/, '');
}

function replacePrefix(input: string, from: string, to: string): string {
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

function rewriteSpecForRuntime(
	spec: unknown,
	opts: { apiBasePath: string; assetRoute: string; apiUrl: string }
): unknown {
	if (!spec || typeof spec !== 'object') {
		return spec;
	}

	const base = normalizeRoute(opts.apiBasePath, '/api');
	const asset = normalizeRoute(opts.assetRoute, '/asset');

	const root = spec as Record<string, unknown>;
	const out: Record<string, unknown> = { ...root };

	// Keep the spec stable while still reflecting the configured public URL and base paths.
	out.servers = [{ url: String(opts.apiUrl || ''), description: 'Configured API_URL' }];

	const rawPaths = root.paths;
	if (!rawPaths || typeof rawPaths !== 'object') {
		return out;
	}

	const rewritten: Record<string, unknown> = {};
	for (const [p, v] of Object.entries(rawPaths as Record<string, unknown>)) {
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
	} catch (err) {
		cachedSpecError = err instanceof Error ? err.message : String(err);
		return null;
	}
}

export function installMailMagicSwagger(server: mailApiServer, opts: SwaggerInstallOptions): void {
	const rawPath = typeof opts.swaggerPath === 'string' ? opts.swaggerPath.trim() : '';
	const enabled = Boolean(opts.swaggerEnabled) || rawPath.length > 0;
	if (!enabled) {
		return;
	}

	const base = normalizeRoute(opts.apiBasePath, '/api');
	const resolved = rawPath.length > 0 ? rawPath : `${base}/swagger`;
	const mount = normalizeRoute(resolved, `${base}/swagger`);

	// Mount under the API router so it runs before the API 404 handler.
	server.useExpress(mount, (req: Request, res: Response, next: NextFunction) => {
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
				apiBasePath: base,
				assetRoute: opts.assetRoute,
				apiUrl: opts.apiUrl
			})
		);
	});
}
