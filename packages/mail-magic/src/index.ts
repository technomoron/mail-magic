import { pathToFileURL } from 'node:url';

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
