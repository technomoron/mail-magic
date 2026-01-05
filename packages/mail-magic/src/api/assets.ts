import fs from 'fs';
import path from 'path';

import { ApiError, ApiModule, ApiRoute } from '@technomoron/api-server-base';

import { mailApiServer } from '../server.js';
import { decodeComponent, sendFileAsync } from '../util.js';

import type { ApiRequest } from '@technomoron/api-server-base';

const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

export class AssetAPI extends ApiModule<mailApiServer> {
	private async getAsset(apiReq: ApiRequest): Promise<[number, null]> {
		const domain = decodeComponent(apiReq.req.params.domain);
		if (!domain || !DOMAIN_PATTERN.test(domain)) {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}

		const rawPath = apiReq.req.params[0] ?? '';
		const segments = rawPath
			.split('/')
			.filter(Boolean)
			.map((segment: string) => decodeComponent(segment));
		if (!segments.length || segments.some((segment) => !SEGMENT_PATTERN.test(segment))) {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}

		const assetsRoot = path.join(this.server.storage.configpath, domain, 'assets');
		if (!fs.existsSync(assetsRoot)) {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}
		const resolvedRoot = fs.realpathSync(assetsRoot);
		const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
		const candidate = path.resolve(assetsRoot, path.join(...segments));

		try {
			const stats = await fs.promises.stat(candidate);
			if (!stats.isFile()) {
				throw new ApiError({ code: 404, message: 'Asset not found' });
			}
		} catch {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}

		let realCandidate: string;
		try {
			realCandidate = await fs.promises.realpath(candidate);
		} catch {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}
		if (!realCandidate.startsWith(normalizedRoot)) {
			throw new ApiError({ code: 404, message: 'Asset not found' });
		}

		const { res } = apiReq;
		const originalStatus = res.status.bind(res);
		const originalJson = res.json.bind(res);
		res.status = ((code: number) => (res.headersSent ? res : originalStatus(code))) as typeof res.status;
		res.json = ((body: unknown) => (res.headersSent ? res : originalJson(body))) as typeof res.json;

		res.type(path.extname(realCandidate));
		res.set('Cache-Control', 'public, max-age=300');

		try {
			await sendFileAsync(res, realCandidate);
		} catch (err) {
			this.server.storage.print_debug(
				`Failed to serve asset ${domain}/${segments.join('/')}: ${err instanceof Error ? err.message : String(err)}`
			);
			if (!res.headersSent) {
				throw new ApiError({ code: 500, message: 'Failed to stream asset' });
			}
		}

		return [200, null];
	}

	override defineRoutes(): ApiRoute[] {
		const route = this.server.storage.env.ASSET_ROUTE;
		const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
		return [
			{
				method: 'get',
				path: `${normalizedRoute}/:domain/*`,
				handler: (apiReq) => this.getAsset(apiReq),
				auth: { type: 'none', req: 'any' }
			}
		];
	}
}
