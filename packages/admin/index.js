import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiModule } from '@technomoron/api-server-base';

const DEFAULT_API_BASE = '/api';
const DEFAULT_ASSET_ROUTE = '/asset';

function normalizeRoute(value, fallback) {
	if (!value) {
		return fallback;
	}
	const trimmed = String(value).trim();
	if (!trimmed) {
		return fallback;
	}
	const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	if (withLeading === '/') {
		return withLeading;
	}
	return withLeading.replace(/\/+$/, '');
}

function resolveCandidate(candidate) {
	if (!candidate) {
		return null;
	}
	try {
		const stats = fs.statSync(candidate);
		if (stats.isFile()) {
			return path.basename(candidate) === 'index.html' ? path.dirname(candidate) : null;
		}
		if (!stats.isDirectory()) {
			return null;
		}
	} catch {
		return null;
	}

	const indexPath = path.join(candidate, 'index.html');
	if (fs.existsSync(indexPath)) {
		return candidate;
	}
	const distCandidate = path.join(candidate, 'dist');
	if (fs.existsSync(path.join(distCandidate, 'index.html'))) {
		return distCandidate;
	}
	return null;
}

export function resolveAdminDist(appPath, logger) {
	if (appPath) {
		const resolved = path.isAbsolute(appPath) ? appPath : path.resolve(process.cwd(), appPath);
		const picked = resolveCandidate(resolved);
		if (picked) {
			return picked;
		}
		if (logger) {
			logger(`Admin UI not found at ADMIN_APP_PATH: ${resolved}`);
		}
	}

	const pkgDir = path.dirname(fileURLToPath(import.meta.url));
	const distPath = resolveCandidate(path.join(pkgDir, 'dist')) || resolveCandidate(pkgDir);
	if (!distPath && logger) {
		logger('Admin UI dist not found in package');
	}
	return distPath;
}

function mountAdminUi(server, distPath, apiBasePath, assetRoute, logger, fallbackOnly = false) {
	const canUseExpress = typeof server?.useExpress === 'function';
	if (!canUseExpress && !server?.app) {
		if (logger) {
			logger('Admin UI mount skipped: server.app not available');
		}
		return false;
	}

	const apiRoute = normalizeRoute(apiBasePath, DEFAULT_API_BASE);
	const assetRouteNormalized = normalizeRoute(assetRoute, DEFAULT_ASSET_ROUTE);
	const indexPath = path.join(distPath, 'index.html');
	if (!fs.existsSync(indexPath)) {
		if (logger) {
			logger(`Admin UI index not found at ${indexPath}`);
		}
		return false;
	}

	const handler = (req, res, next) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			next();
			return;
		}
		if (req.path.startsWith(apiRoute) || req.path.startsWith(assetRouteNormalized)) {
			next();
			return;
		}

		const requestPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
		const resolvedPath = path.resolve(distPath, requestPath);
		if (!resolvedPath.startsWith(`${distPath}${path.sep}`) && resolvedPath !== distPath) {
			next();
			return;
		}

		try {
			const stats = fs.statSync(resolvedPath);
			if (stats.isFile()) {
				if (fallbackOnly) {
					next();
					return;
				}
				res.sendFile(resolvedPath);
				return;
			}
		} catch {
			// fall through to index
		}

		res.sendFile(indexPath);
	};

	if (canUseExpress) {
		server.useExpress(handler);
		return true;
	}

	server.app.get('*', handler);

	return true;
}

export class AdminAPI extends ApiModule {
	defineRoutes() {
		return [
			{
				method: 'get',
				path: '/v1/admin/status',
				handler: async () => [200, { status: 'ok' }],
				auth: { type: 'yes', req: 'any' }
			}
		];
	}
}

export function registerAdmin(server, options = {}) {
	const logger = typeof options.logger === 'function' ? options.logger : null;
	let apiRegistered = false;
	if (server?.api) {
		server.api(new AdminAPI());
		apiRegistered = true;
	}

	const distPath = resolveAdminDist(options.appPath, logger);
	const uiMounted = distPath
		? mountAdminUi(
				server,
				distPath,
				options.apiBasePath,
				options.assetRoute,
				logger,
				Boolean(options.staticFallback)
			)
		: false;

	return { api: apiRegistered, ui: uiMounted, distPath: distPath ?? null };
}
