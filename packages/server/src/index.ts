import { pathToFileURL } from 'node:url';

import { AssetAPI, createAssetHandler } from './api/assets.js';
import { FormAPI } from './api/forms.js';
import { MailerAPI } from './api/mailer.js';
import { mailApiServer } from './server.js';
import { MailStoreVars, mailStore } from './store/store.js';
import { installMailMagicSwagger } from './swagger.js';
import { MAIL_MAGIC_API_BASE_PATH, MAIL_MAGIC_ASSET_ROUTE, MAIL_MAGIC_SWAGGER_PATH } from './util/route.js';

import type { ApiModule, ApiServerConf } from '@technomoron/api-server-base';

export type MailMagicServerOptions = Partial<Omit<ApiServerConf, 'apiBasePath' | 'swaggerPath'>>;
type ResolvedMailMagicServerOptions = MailMagicServerOptions & Pick<ApiServerConf, 'apiBasePath' | 'swaggerPath'>;

export type MailMagicServerBootstrap = {
	server: mailApiServer;
	store: mailStore;
	vars: MailStoreVars;
};

export const STARTUP_ERROR_MESSAGE = 'Failed to start mail-magic:';

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

function buildServerConfig(store: mailStore, overrides: MailMagicServerOptions): ResolvedMailMagicServerOptions {
	const env = store.vars;
	return {
		apiHost: env.API_HOST,
		apiPort: env.API_PORT,
		uploadPath: store.getUploadStagingPath(),
		uploadMax: env.UPLOAD_MAX,
		debug: env.DEBUG,
		swaggerEnabled: env.SWAGGER_ENABLED,
		apiKeyEnabled: true,
		apiKeyPrefix: 'apikey-',
		...overrides,
		apiBasePath: MAIL_MAGIC_API_BASE_PATH,
		swaggerPath: MAIL_MAGIC_SWAGGER_PATH
	};
}

export async function createMailMagicServer(
	overrides: MailMagicServerOptions = {},
	envOverrides: Partial<MailStoreVars> = {}
): Promise<MailMagicServerBootstrap> {
	const store = await new mailStore().init(envOverrides);
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
	// ApiServerBase's built-in swagger handler loads from process.cwd(); install our own fixed-path handler so
	// SWAGGER_ENABLED works regardless of where the .env lives (mail-magic CLI chdir's to the env dir).
	const { swaggerEnabled } = config;
	const serverConfig = { ...config, swaggerEnabled: false, swaggerPath: '' };
	const server = new mailApiServer(serverConfig, store).api(new MailerAPI()).api(new FormAPI()).api(new AssetAPI());
	installMailMagicSwagger(server, {
		apiUrl: String(store.vars.API_URL || ''),
		swaggerEnabled
	});

	// Serve domain assets from the fixed public route with traversal protection and caching.
	const assetHandler = createAssetHandler(server);
	for (const prefix of [MAIL_MAGIC_ASSET_ROUTE, `${MAIL_MAGIC_API_BASE_PATH}${MAIL_MAGIC_ASSET_ROUTE}`]) {
		// Use ApiServer.useExpress() so mounts under the fixed API path are installed before the API
		// 404 handler. Fastify (find-my-way) requires the wildcard to be an unnamed `*`.
		server.useExpress(`${prefix}/:domain/*`, assetHandler);
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
		console.error(STARTUP_ERROR_MESSAGE, err);
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
				apiBasePath: MAIL_MAGIC_API_BASE_PATH,
				assetRoute: MAIL_MAGIC_ASSET_ROUTE,
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
