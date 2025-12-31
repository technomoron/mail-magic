import fs from 'fs';
import path from 'path';

import { ApiModule } from '@technomoron/api-server-base';

import { mailApiServer } from '../server.js';
import { decodeComponent, sendFileAsync } from '../util.js';

type AssetRequest = {
	method?: string;
	path?: string;
};

type AssetResponse = {
	status: (code: number) => AssetResponse;
	send: (body?: string) => void;
	sendFile: (file: string, cb: (err?: Error | null) => void) => void;
};

function normalizeRoute(route: string): string {
	if (!route) {
		return '/asset';
	}
	const withSlash = route.startsWith('/') ? route : `/${route}`;
	return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

function resolveAssetsRoot(configPath: string, domain: string): string | null {
	const root = path.resolve(configPath);
	const assetsRoot = path.resolve(root, domain, 'assets');
	const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
	if (!assetsRoot.startsWith(normalizedRoot)) {
		return null;
	}
	return assetsRoot;
}

async function handleAssetRequest(
	req: AssetRequest,
	res: AssetResponse,
	store: mailApiServer['storage']
): Promise<void> {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.status(405).send('Method not allowed');
		return;
	}

	const rawPath = req.path ?? '';
	const trimmed = rawPath.replace(/^\/+/, '');
	if (!trimmed) {
		res.status(404).send('Missing asset path');
		return;
	}

	const [rawDomain, ...rawSegments] = trimmed.split('/');
	const domain = decodeComponent(rawDomain);
	if (!domain) {
		res.status(400).send('Invalid domain');
		return;
	}

	const assetSegments = rawSegments.map((segment: string) => decodeComponent(segment)).filter(Boolean);
	if (assetSegments.length === 0) {
		res.status(404).send('Missing asset path');
		return;
	}

	const assetsRoot = resolveAssetsRoot(store.configpath, domain);
	if (!assetsRoot) {
		res.status(400).send('Invalid domain');
		return;
	}

	const requestedPath = path.join(...assetSegments);
	const candidate = path.resolve(assetsRoot, requestedPath);
	const normalizedRoot = assetsRoot.endsWith(path.sep) ? assetsRoot : assetsRoot + path.sep;
	if (!candidate.startsWith(normalizedRoot)) {
		res.status(400).send('Invalid asset path');
		return;
	}

	if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
		res.status(404).send('Asset not found');
		return;
	}

	try {
		await sendFileAsync(res, candidate);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to send asset';
		res.status(500).send(message);
	}
}

export class AssetAPI extends ApiModule<mailApiServer> {
	override checkConfig(): boolean {
		const route = normalizeRoute(this.server.storage.env.ASSET_ROUTE);
		this.server.useExpress(route, (req: AssetRequest, res: AssetResponse) =>
			handleAssetRequest(req, res, this.server.storage)
		);
		return true;
	}

	override defineRoutes() {
		return [];
	}
}
