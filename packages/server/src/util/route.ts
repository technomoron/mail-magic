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
