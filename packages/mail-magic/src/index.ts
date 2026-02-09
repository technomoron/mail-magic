import { pathToFileURL } from 'node:url';

import { AssetAPI, createAssetHandler } from './api/assets.js';
import { FormAPI } from './api/forms.js';
import { MailerAPI } from './api/mailer.js';
import { mailApiServer } from './server.js';
import { MailStoreVars, mailStore } from './store/store.js';
import { installMailMagicSwagger } from './swagger.js';

import type { ApiModule, ApiServerConf } from '@technomoron/api-server-base';

export type MailMagicServerOptions = Partial<ApiServerConf>;

export type MailMagicServerBootstrap = {
	server: mailApiServer;
	store: mailStore;
	vars: MailStoreVars;
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

function mergeStaticDirs(
	base: Record<string, string>,
	override?: Record<string, string>
): Record<string, string> | undefined {
	const merged = { ...base, ...(override ?? {}) };
	if (Object.keys(merged).length === 0) {
		return undefined;
	}
	return merged;
}

function buildServerConfig(store: mailStore, overrides: MailMagicServerOptions): MailMagicServerOptions {
	const env = store.vars;
	return {
		apiHost: env.API_HOST,
		apiPort: env.API_PORT,
		uploadPath: store.getUploadStagingPath(),
		uploadMax: env.UPLOAD_MAX,
		debug: env.DEBUG,
		apiBasePath: normalizeRoute(env.API_BASE_PATH, '/api'),
		swaggerEnabled: env.SWAGGER_ENABLED,
		swaggerPath: env.SWAGGER_PATH,
		...overrides
	};
}

export async function createMailMagicServer(
	overrides: MailMagicServerOptions = {},
	envOverrides: Partial<MailStoreVars> = {}
): Promise<MailMagicServerBootstrap> {
	const store = await new mailStore().init(envOverrides);
	if (typeof overrides.apiBasePath === 'string') {
		store.vars.API_BASE_PATH = overrides.apiBasePath;
	}
	const baseStaticDirs: Record<string, string> = {};

	let adminUiPath: string | null = null;
	if (store.vars.ADMIN_ENABLED) {
		adminUiPath = await resolveAdminUiPath(store);
		if (adminUiPath) {
			baseStaticDirs['/'] = adminUiPath;
		}
	}
	const mergedOverrides: MailMagicServerOptions = {
		...overrides,
		staticDirs: mergeStaticDirs(baseStaticDirs, overrides.staticDirs as Record<string, string> | undefined)
	};

	const config = buildServerConfig(store, mergedOverrides);
	// ApiServerBase's built-in swagger handler loads from process.cwd(); install our own handler so
	// SWAGGER_ENABLED works regardless of where the .env lives (mail-magic CLI chdir's to the env dir).
	const { swaggerEnabled, swaggerPath } = config;
	const serverConfig = { ...config, swaggerEnabled: false, swaggerPath: '' };
	const server = new mailApiServer(serverConfig, store).api(new MailerAPI()).api(new FormAPI()).api(new AssetAPI());
	installMailMagicSwagger(server, {
		apiBasePath: String(config.apiBasePath || '/api'),
		assetRoute: String(store.vars.ASSET_ROUTE || '/asset'),
		apiUrl: String(store.vars.API_URL || ''),
		swaggerEnabled,
		swaggerPath
	});

	// Serve domain assets from a public route with traversal protection and caching.
	const assetRoute = normalizeRoute(store.vars.ASSET_ROUTE, '/asset');
	const assetPrefix = assetRoute === '/' ? '' : assetRoute;
	const apiBasePath = normalizeRoute(store.vars.API_BASE_PATH, '/api');
	const apiBasePrefix = apiBasePath === '/' ? '' : apiBasePath;
	const assetHandler = createAssetHandler(server);
	const assetMounts = new Set<string>();
	assetMounts.add(assetPrefix);
	// Integration tests (and API_URL defaults) expect assets to also be reachable under the API base path.
	if (apiBasePrefix && assetPrefix && !assetPrefix.startsWith(`${apiBasePrefix}/`)) {
		assetMounts.add(`${apiBasePrefix}${assetPrefix}`);
	}
	for (const prefix of assetMounts) {
		// Express 5 (path-to-regexp v8) requires wildcard params to be named.
		// Use ApiServer.useExpress() so mounts under `apiBasePath` are installed on the API router
		// (and remain reachable before the API 404 handler).
		server.useExpress(`${prefix}/:domain/*path`, assetHandler);
	}

	if (store.vars.ADMIN_ENABLED) {
		await enableAdminFeatures(server, store, adminUiPath);
	} else {
		store.print_debug('Admin UI/API disabled via ADMIN_ENABLED');
	}

	return { server, store, vars: store.vars };
}

export async function startMailMagicServer(
	overrides: MailMagicServerOptions = {},
	envOverrides: Partial<MailStoreVars> = {}
): Promise<MailMagicServerBootstrap> {
	const bootstrap = await createMailMagicServer(overrides, envOverrides);
	await bootstrap.server.start();
	return bootstrap;
}

async function bootMailMagic() {
	try {
		const { vars } = await startMailMagicServer();
		console.log(`mail-magic server listening on ${vars.API_HOST}:${vars.API_PORT}`);
	} catch (err) {
		console.error('Failed to start FormMailer:', err);
		process.exit(1);
	}
}

const isDirectExecution = (() => {
	if (!process.argv[1]) {
		return false;
	}

	try {
		return import.meta.url === pathToFileURL(process.argv[1]).href;
	} catch {
		return false;
	}
})();

if (isDirectExecution) {
	void bootMailMagic();
}

async function resolveAdminUiPath(store: mailStore): Promise<string | null> {
	try {
		const mod = (await import('@technomoron/mail-magic-admin')) as {
			resolveAdminDist?: (appPath?: string, logger?: (message: string) => void) => string | null;
		};
		if (typeof mod?.resolveAdminDist === 'function') {
			return mod.resolveAdminDist(store.vars.ADMIN_APP_PATH, (message: string) => store.print_debug(message));
		}
	} catch (err) {
		store.print_debug(`Unable to resolve admin UI path: ${err instanceof Error ? err.message : String(err)}`);
	}
	return null;
}

async function enableAdminFeatures(server: mailApiServer, store: mailStore, adminUiPath: string | null): Promise<void> {
	try {
		const mod = (await import('@technomoron/mail-magic-admin')) as {
			registerAdmin?: (server: mailApiServer, options?: Record<string, unknown>) => unknown;
			AdminAPI?: new () => ApiModule;
		};
		if (typeof mod?.registerAdmin === 'function') {
			await mod.registerAdmin(server, {
				apiBasePath: normalizeRoute(store.vars.API_BASE_PATH, '/api'),
				assetRoute: normalizeRoute(store.vars.ASSET_ROUTE, '/asset'),
				appPath: adminUiPath ?? store.vars.ADMIN_APP_PATH,
				logger: (message: string) => store.print_debug(message),
				staticFallback: Boolean(adminUiPath)
			});
		} else if (mod?.AdminAPI) {
			server.api(new mod.AdminAPI());
		} else {
			store.print_debug('Admin features not exported from @technomoron/mail-magic-admin');
		}
	} catch (err) {
		store.print_debug(`Unable to load admin module: ${err instanceof Error ? err.message : String(err)}`);
	}
}
