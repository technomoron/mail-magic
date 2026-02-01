import { pathToFileURL } from 'node:url';

import { AssetAPI, createAssetHandler } from './api/assets.js';
import { FormAPI } from './api/forms.js';
import { MailerAPI } from './api/mailer.js';
import { mailApiServer } from './server.js';
import { mailStore } from './store/store.js';

import type { ApiModule, ApiServerConf } from '@technomoron/api-server-base';

export type MailMagicServerOptions = Partial<ApiServerConf>;

export type MailMagicServerBootstrap = {
	server: mailApiServer;
	store: mailStore;
	env: mailStore['env'];
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

function buildServerConfig(store: mailStore, overrides: MailMagicServerOptions): MailMagicServerOptions {
	const env = store.env;
	return {
		apiHost: env.API_HOST,
		apiPort: env.API_PORT,
		uploadPath: store.getUploadStagingPath(),
		debug: env.DEBUG,
		apiBasePath: normalizeRoute(env.API_BASE_PATH, '/api'),
		swaggerEnabled: env.SWAGGER_ENABLED,
		swaggerPath: env.SWAGGER_PATH,
		...overrides
	};
}

export async function createMailMagicServer(overrides: MailMagicServerOptions = {}): Promise<MailMagicServerBootstrap> {
	const store = await new mailStore().init();
	if (typeof overrides.apiBasePath === 'string') {
		store.env.API_BASE_PATH = overrides.apiBasePath;
	}
	const config = buildServerConfig(store, overrides);
	const server = new mailApiServer(config, store).api(new MailerAPI()).api(new FormAPI()).api(new AssetAPI());
	mountAssetRoute(server, store);
	if (store.env.ADMIN_ENABLED) {
		await enableAdminFeatures(server, store);
	} else {
		store.print_debug('Admin UI/API disabled via ADMIN_ENABLED');
	}

	return { server, store, env: store.env };
}

export async function startMailMagicServer(overrides: MailMagicServerOptions = {}): Promise<MailMagicServerBootstrap> {
	const bootstrap = await createMailMagicServer(overrides);
	await bootstrap.server.start();
	return bootstrap;
}

async function bootMailMagic() {
	try {
		const { env } = await startMailMagicServer();
		console.log(`mail-magic server listening on ${env.API_HOST}:${env.API_PORT}`);
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

async function enableAdminFeatures(server: mailApiServer, store: mailStore): Promise<void> {
	try {
		const mod = (await import('@technomoron/mail-magic-admin')) as {
			registerAdmin?: (server: mailApiServer, options?: Record<string, unknown>) => unknown;
			AdminAPI?: new () => ApiModule;
		};
		if (typeof mod?.registerAdmin === 'function') {
			await mod.registerAdmin(server, {
				apiBasePath: normalizeRoute(store.env.API_BASE_PATH, '/api'),
				assetRoute: normalizeRoute(store.env.ASSET_ROUTE, '/asset'),
				appPath: store.env.ADMIN_APP_PATH,
				logger: (message: string) => store.print_debug(message)
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

function mountAssetRoute(server: mailApiServer, store: mailStore): void {
	const normalizedRoute = normalizeRoute(store.env.ASSET_ROUTE, '/asset');
	server.app.get(`${normalizedRoute}/:domain/*`, createAssetHandler(server));
	ensureApiNotFoundLast(server);
}

function ensureApiNotFoundLast(server: mailApiServer): void {
	type RouterLayer = { handle?: unknown };
	const anyServer = server as unknown as {
		apiNotFoundHandler?: unknown;
		app?: { _router?: { stack?: RouterLayer[] } };
	};
	const handler = anyServer.apiNotFoundHandler;
	const stack = anyServer.app?._router?.stack;
	if (!handler || !Array.isArray(stack)) {
		return;
	}
	const index = stack.findIndex((layer) => layer?.handle === handler);
	if (index === -1 || index === stack.length - 1) {
		return;
	}
	const [layer] = stack.splice(index, 1);
	stack.push(layer);
}
