export const MAIL_MAGIC_API_BASE_PATH = '/api';
export const MAIL_MAGIC_ASSET_ROUTE = '/asset';
export const MAIL_MAGIC_SWAGGER_PATH = '/api/swagger';

export function normalizeRoute(value: string, fallback = ''): string {
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
