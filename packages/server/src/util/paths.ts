import path from 'path';

import { ApiError } from '@technomoron/api-server-base';

import { normalizeSlug } from './utils.js';

export const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function normalizeSubdir(value: string): string {
	if (!value) {
		return '';
	}
	const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	if (!cleaned) {
		return '';
	}
	const segments = cleaned.split('/').filter(Boolean);
	for (const segment of segments) {
		if (segment === '..' || segment === '.') {
			throw new ApiError({ code: 400, message: `Invalid path segment "${segment}"` });
		}
		if (!SEGMENT_PATTERN.test(segment)) {
			throw new ApiError({ code: 400, message: `Invalid path segment "${segment}"` });
		}
	}
	return path.join(...segments);
}

export function assertSafeRelativePath(filename: string, label: string): string {
	const normalized = path.normalize(filename);
	if (path.isAbsolute(normalized)) {
		throw new Error(`${label} path must be relative`);
	}
	if (normalized.split(path.sep).includes('..')) {
		throw new Error(`${label} path cannot include '..' segments`);
	}
	return normalized;
}

export function buildFormSlugAndFilename(params: {
	domainName: string;
	domainLocale: string;
	idname: string;
	locale: string;
}): { localeSlug: string; slug: string; filename: string } {
	const domainSlug = normalizeSlug(params.domainName);
	const formSlug = normalizeSlug(params.idname);
	const localeSlug = normalizeSlug(params.locale || params.domainLocale || '');
	const slug = `${domainSlug}${localeSlug ? '-' + localeSlug : ''}-${formSlug}`;
	const filenameParts = [domainSlug, 'form-template'];
	if (localeSlug) {
		filenameParts.push(localeSlug);
	}
	filenameParts.push(formSlug);
	let filename = path.join(...filenameParts);
	if (!filename.endsWith('.njk')) {
		filename += '.njk';
	}
	return { localeSlug, slug, filename };
}

export function buildAssetUrl(baseUrl: string, route: string, domainName: string, assetPath: string): string {
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
