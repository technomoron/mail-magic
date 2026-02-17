import path from 'path';
import { ApiError } from '@technomoron/api-server-base';
export const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;
export function normalizeSubdir(value) {
    if (!value) {
        return '';
    }
    const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!cleaned) {
        return '';
    }
    const segments = cleaned.split('/').filter(Boolean);
    for (const segment of segments) {
        if (!SEGMENT_PATTERN.test(segment)) {
            throw new ApiError({ code: 400, message: `Invalid path segment "${segment}"` });
        }
    }
    return path.join(...segments);
}
export function assertSafeRelativePath(filename, label) {
    const normalized = path.normalize(filename);
    if (path.isAbsolute(normalized)) {
        throw new Error(`${label} path must be relative`);
    }
    if (normalized.split(path.sep).includes('..')) {
        throw new Error(`${label} path cannot include '..' segments`);
    }
    return normalized;
}
export function buildAssetUrl(baseUrl, route, domainName, assetPath) {
    const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedRoute = route ? (route.startsWith('/') ? route : `/${route}`) : '';
    const encodedDomain = encodeURIComponent(domainName);
    const encodedPath = assetPath
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    const trailing = encodedPath ? `/${encodedPath}` : '';
    return `${trimmedBase}${normalizedRoute}/${encodedDomain}${trailing}`;
}
