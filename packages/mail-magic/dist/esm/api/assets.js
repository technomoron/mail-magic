import fs from 'fs';
import path from 'path';
import { ApiError, ApiModule } from '@technomoron/api-server-base';
import { api_form } from '../models/form.js';
import { api_txmail } from '../models/txmail.js';
import { SEGMENT_PATTERN, normalizeSubdir } from '../util/paths.js';
import { moveUploadedFiles } from '../util/uploads.js';
import { decodeComponent, getBodyValue, sendFileAsync } from '../util.js';
import { assert_domain_and_user } from './auth.js';
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
export class AssetAPI extends ApiModule {
    async resolveTemplateDir(apireq) {
        const body = apireq.req.body ?? {};
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
        const domainId = apireq.domain.domain_id;
        if (templateType === 'tx') {
            const template = (await api_txmail.findOne({ where: { name: templateName, domain_id: domainId, locale } })) ||
                (await api_txmail.findOne({ where: { name: templateName, domain_id: domainId, locale: '' } }));
            if (!template) {
                throw new ApiError({
                    code: 404,
                    message: `Template "${templateName}" not found for domain "${apireq.domain.name}"`
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
            const form = (await api_form.findOne({ where: { idname: templateName, domain_id: domainId, locale } })) ||
                (await api_form.findOne({ where: { idname: templateName, domain_id: domainId, locale: '' } }));
            if (!form) {
                throw new ApiError({
                    code: 404,
                    message: `Form "${templateName}" not found for domain "${apireq.domain.name}"`
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
    async postAssets(apireq) {
        await assert_domain_and_user(apireq);
        const rawFiles = Array.isArray(apireq.req.files) ? apireq.req.files : [];
        if (!rawFiles.length) {
            throw new ApiError({ code: 400, message: 'No files uploaded' });
        }
        const body = apireq.req.body ?? {};
        const subdir = normalizeSubdir(getBodyValue(body, 'path', 'dir'));
        const templateType = getBodyValue(body, 'templateType', 'template_type', 'type');
        let targetRoot;
        if (templateType) {
            targetRoot = await this.resolveTemplateDir(apireq);
        }
        else {
            targetRoot = path.join(this.server.storage.configpath, apireq.domain.name, 'assets');
        }
        const candidate = path.resolve(targetRoot, subdir);
        const normalizedRoot = targetRoot.endsWith(path.sep) ? targetRoot : targetRoot + path.sep;
        if (candidate !== targetRoot && !candidate.startsWith(normalizedRoot)) {
            throw new ApiError({ code: 400, message: 'Invalid asset target path' });
        }
        await moveUploadedFiles(rawFiles, candidate);
        return [200, { Status: 'OK' }];
    }
    defineRoutes() {
        return [
            {
                method: 'post',
                path: '/v1/assets',
                handler: (apiReq) => this.postAssets(apiReq),
                auth: { type: 'yes', req: 'any' }
            }
        ];
    }
}
export function createAssetHandler(server) {
    return async (req, res, next) => {
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            if (next) {
                next();
                return;
            }
            res.status(405).end();
            return;
        }
        const domain = decodeComponent(req?.params?.domain);
        if (!domain || !DOMAIN_PATTERN.test(domain)) {
            res.status(404).end();
            return;
        }
        const rawPathParam = req?.params?.path ?? req?.params?.[0];
        const rawSegments = Array.isArray(rawPathParam)
            ? rawPathParam
            : typeof rawPathParam === 'string'
                ? rawPathParam.split('/').filter(Boolean)
                : [];
        const segments = rawSegments.map((segment) => decodeComponent(typeof segment === 'string' ? segment : ''));
        if (!segments.length || segments.some((segment) => !SEGMENT_PATTERN.test(segment))) {
            res.status(404).end();
            return;
        }
        const assetsRoot = path.join(server.storage.configpath, domain, 'assets');
        if (!fs.existsSync(assetsRoot)) {
            res.status(404).end();
            return;
        }
        const resolvedRoot = fs.realpathSync(assetsRoot);
        const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
        const candidate = path.resolve(assetsRoot, path.join(...segments));
        try {
            const stats = await fs.promises.stat(candidate);
            if (!stats.isFile()) {
                res.status(404).end();
                return;
            }
        }
        catch {
            res.status(404).end();
            return;
        }
        let realCandidate;
        try {
            realCandidate = await fs.promises.realpath(candidate);
        }
        catch {
            res.status(404).end();
            return;
        }
        if (!realCandidate.startsWith(normalizedRoot)) {
            res.status(404).end();
            return;
        }
        res.type(path.extname(realCandidate));
        try {
            // Express' `sendFile()` sets Cache-Control based on `maxAge` (in ms). Setting the header
            // before calling `sendFile()` can be overwritten by Express defaults.
            await sendFileAsync(res, realCandidate, { maxAge: 300_000 });
        }
        catch (err) {
            server.storage.print_debug(`Failed to serve asset ${domain}/${segments.join('/')}: ${err instanceof Error ? err.message : String(err)}`);
            if (!res.headersSent) {
                res.status(500).end();
            }
        }
    };
}
