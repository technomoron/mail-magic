import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AssetAPI } from './api/assets.js';
import { FormAPI } from './api/forms.js';
import { MailerAPI } from './api/mailer.js';
import { mailApiServer } from './server.js';
import { mailStore } from './store/store.js';

import type { ApiServerConf } from '@technomoron/api-server-base';

export type MailMagicServerOptions = Partial<ApiServerConf>;

export type MailMagicServerBootstrap = {
	server: mailApiServer;
	store: mailStore;
	env: mailStore['env'];
};

function buildServerConfig(store: mailStore, overrides: MailMagicServerOptions): MailMagicServerOptions {
	const env = store.env;
	return {
		apiHost: env.API_HOST,
		apiPort: env.API_PORT,
		uploadPath: store.getUploadStagingPath(),
		debug: env.DEBUG,
		apiBasePath: '',
		swaggerEnabled: env.SWAGGER_ENABLED,
		swaggerPath: env.SWAGGER_PATH,
		...overrides
	};
}

export async function createMailMagicServer(overrides: MailMagicServerOptions = {}): Promise<MailMagicServerBootstrap> {
	const store = await new mailStore().init();
	const config = buildServerConfig(store, overrides);
	const server = new mailApiServer(config, store).api(new MailerAPI()).api(new FormAPI()).api(new AssetAPI());
	mountAdminUi(server, store);

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

function resolveAdminDist(): string | null {
	const require = createRequire(import.meta.url);
	try {
		const pkgPath = require.resolve('@technomoron/mail-magic-admin/package.json');
		const pkgDir = path.dirname(pkgPath);
		const distPath = path.join(pkgDir, 'dist');
		if (fs.existsSync(distPath)) {
			return distPath;
		}
	} catch {
		// ignore
	}

	const fallbackBase = path.dirname(fileURLToPath(import.meta.url));
	const fallback = path.resolve(fallbackBase, '..', '..', 'mail-magic-admin', 'dist');
	if (fs.existsSync(fallback)) {
		return fallback;
	}

	return null;
}

function mountAdminUi(server: mailApiServer, store: mailStore): void {
	const distPath = resolveAdminDist();
	if (!distPath) {
		store.print_debug('Admin UI not found, skipping static mount');
		return;
	}

	const assetRoute = store.env.ASSET_ROUTE.startsWith('/') ? store.env.ASSET_ROUTE : `/${store.env.ASSET_ROUTE}`;
	const indexPath = path.join(distPath, 'index.html');
	const hasIndex = fs.existsSync(indexPath);
	server.app.get('*', (req, res, next) => {
		if (req.method !== 'GET') {
			next();
			return;
		}
		if (req.path.startsWith('/api') || req.path.startsWith(assetRoute)) {
			next();
			return;
		}

		const requestPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
		const resolvedPath = path.resolve(distPath, requestPath);
		if (!resolvedPath.startsWith(`${distPath}${path.sep}`) && resolvedPath !== distPath) {
			next();
			return;
		}

		if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
			res.sendFile(resolvedPath);
			return;
		}

		if (!hasIndex) {
			next();
			return;
		}
		res.sendFile(indexPath);
	});
}
