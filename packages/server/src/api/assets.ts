import fs from 'fs';
import path from 'path';

import { ApiError, ApiModule, ApiRoute } from '@technomoron/api-server-base';

import { api_form } from '../models/form.js';
import { api_txmail } from '../models/txmail.js';
import { mailApiServer } from '../server.js';
import { SEGMENT_PATTERN, normalizeSubdir } from '../util/paths.js';
import { moveUploadedFiles } from '../util/uploads.js';
import { getBodyValue } from '../util/utils.js';
import { decodeComponent } from '../util.js';

import { assert_domain_and_user } from './auth.js';

import type { mailApiRequest, UploadedFile } from '../types.js';
import type { ApiRequest, ExtendedReq } from '@technomoron/api-server-base';

type ApiRes = ApiRequest['res'];

// Internal: type-assertion shape to access Fastify reply header/type methods through
// the ApiRes compat wrapper, which does not expose header-setting natively.
type FastifyReplyAccessor = { reply?: { type(t: string): void; header(k: string, v: string): void } };

const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.html': 'text/html',
	'.htm': 'text/html',
	'.pdf': 'application/pdf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.eot': 'application/vnd.ms-fontobject'
};

function getMimeType(ext: string): string {
	return MIME_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}
export class AssetAPI extends ApiModule<mailApiServer> {
	private async resolveTemplateDir(apireq: mailApiRequest): Promise<string> {
		const body = (apireq.req.body ?? {}) as Record<string, unknown>;
		const templateTypeRaw = getBodyValue(body, 'templateType', 'template_type', 'type');
		const templateName = getBodyValue(body, 'template', 'name', 'idname', 'formid');
		const locale = getBodyValue(body, 'locale');

		if (!templateTypeRaw) {
			throw new ApiError({ code: 400, message: 'Missing templateType for template asset upload' });
		}
		if (!templateName) {
			throw new ApiError({ code: 400, message: 'Missing template name/id for template asset upload' });
		}

		const templateType = templateTypeRaw.toLowerCase();
		const domainId = apireq.domain!.domain_id;

		if (templateType === 'tx') {
			const template =
				(await api_txmail.findOne({ where: { name: templateName, domain_id: domainId, locale } })) ||
				(await api_txmail.findOne({ where: { name: templateName, domain_id: domainId, locale: '' } }));
			if (!template) {
				throw new ApiError({
					code: 404,
					message: `Template "${templateName}" not found for domain "${apireq.domain!.name}"`
				});
			}
			const candidate = path.resolve(this.server.storage.configpath, template.filename);
			const configRoot = this.server.storage.configpath;
			const normalizedRoot = configRoot.endsWith(path.sep) ? configRoot : configRoot + path.sep;
			if (!candidate.startsWith(normalizedRoot)) {
				throw new ApiError({ code: 400, message: 'Template path escapes config root' });
			}
			return path.dirname(candidate);
		}

		if (templateType === 'form') {
			const form =
				(await api_form.findOne({ where: { idname: templateName, domain_id: domainId, locale } })) ||
				(await api_form.findOne({ where: { idname: templateName, domain_id: domainId, locale: '' } }));
			if (!form) {
				throw new ApiError({
					code: 404,
					message: `Form "${templateName}" not found for domain "${apireq.domain!.name}"`
				});
			}
			const candidate = path.resolve(this.server.storage.configpath, form.filename);
			const configRoot = this.server.storage.configpath;
			const normalizedRoot = configRoot.endsWith(path.sep) ? configRoot : configRoot + path.sep;
			if (!candidate.startsWith(normalizedRoot)) {
				throw new ApiError({ code: 400, message: 'Template path escapes config root' });
			}
			return path.dirname(candidate);
		}

		throw new ApiError({ code: 400, message: 'templateType must be "tx" or "form"' });
	}

	private async postAssets(apireq: mailApiRequest): Promise<[number, { Status: string }]> {
		await assert_domain_and_user(apireq);

		const rawFiles = Array.isArray(apireq.req.files) ? (apireq.req.files as unknown as UploadedFile[]) : [];
		if (!rawFiles.length) {
			throw new ApiError({ code: 400, message: 'No files uploaded' });
		}

		const body = (apireq.req.body ?? {}) as Record<string, unknown>;
		const subdir = normalizeSubdir(getBodyValue(body, 'path', 'dir'));
		const templateType = getBodyValue(body, 'templateType', 'template_type', 'type');

		let targetRoot: string;
		if (templateType) {
			targetRoot = await this.resolveTemplateDir(apireq);
		} else {
			targetRoot = path.join(this.server.storage.configpath, apireq.domain!.name, 'assets');
		}

		const candidate = path.resolve(targetRoot, subdir);
		const normalizedRoot = targetRoot.endsWith(path.sep) ? targetRoot : targetRoot + path.sep;
		if (candidate !== targetRoot && !candidate.startsWith(normalizedRoot)) {
			throw new ApiError({ code: 400, message: 'Invalid asset target path' });
		}

		await moveUploadedFiles(rawFiles, candidate);

		return [200, { Status: 'OK' }];
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{
				method: 'post',
				path: '/v1/assets',
				handler: (apiReq) => this.postAssets(apiReq as mailApiRequest),
				auth: { type: 'yes', req: 'any' }
			}
		];
	}
}

export function createAssetHandler(server: mailApiServer) {
	return async (req: ExtendedReq, res: ApiRes, next?: (error?: unknown) => void): Promise<void> => {
		if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
			if (next) {
				next();
				return;
			}
			res.status(405).send(null);
			return;
		}

		const domain = decodeComponent(req?.params?.['domain'] as string | undefined);
		if (!domain || !DOMAIN_PATTERN.test(domain)) {
			res.status(404).send(null);
			return;
		}

		const rawPathParam = req.params?.['path'] ?? req.params?.['*'];
		const rawSegments = Array.isArray(rawPathParam)
			? rawPathParam
			: typeof rawPathParam === 'string'
				? rawPathParam.split('/').filter(Boolean)
				: [];
		const segments = rawSegments.map((segment: unknown) =>
			decodeComponent(typeof segment === 'string' ? segment : '')
		);
		if (!segments.length || segments.some((segment: string) => !SEGMENT_PATTERN.test(segment))) {
			res.status(404).send(null);
			return;
		}

		const assetsRoot = path.join(server.storage.configpath, domain, 'assets');
		if (!fs.existsSync(assetsRoot)) {
			res.status(404).send(null);
			return;
		}
		const resolvedRoot = fs.realpathSync(assetsRoot);
		const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
		const candidate = path.resolve(assetsRoot, path.join(...segments));

		try {
			const stats = await fs.promises.stat(candidate);
			if (!stats.isFile()) {
				res.status(404).send(null);
				return;
			}
		} catch {
			res.status(404).send(null);
			return;
		}

		let realCandidate: string;
		try {
			realCandidate = await fs.promises.realpath(candidate);
		} catch {
			res.status(404).send(null);
			return;
		}
		if (!realCandidate.startsWith(normalizedRoot)) {
			res.status(404).send(null);
			return;
		}

		const ext = path.extname(realCandidate);
		// Access the underlying Fastify reply to set content-type and cache-control headers.
		// ApiResponse does not expose arbitrary header-setting methods.
		const fastifyReply = (res as unknown as FastifyReplyAccessor).reply;
		if (fastifyReply) {
			fastifyReply.type(getMimeType(ext));
			fastifyReply.header('cache-control', 'public, max-age=300');
		}

		try {
			const content = await fs.promises.readFile(realCandidate);
			res.send(content);
		} catch (err) {
			server.storage.print_debug(
				`Failed to serve asset ${domain}/${segments.join('/')}: ${err instanceof Error ? err.message : String(err)}`
			);
			if (!res.headersSent) {
				res.status(500).send(null);
			}
		}
	};
}
