import { api_domain } from '../models/domain.js';
import { api_user } from '../models/user.js';

import type { RequestMeta } from '../types.js';

/**
 * Normalize a string into a safe identifier for slugs, filenames, etc.
 *
 * - Lowercases all characters
 * - Replaces any character that is not `a-z`, `0-9`, `-`, '.' or `_` with `-`
 * - Collapses multiple consecutive dashes into one
 * - Trims leading and trailing dashes
 *
 * Examples:
 *   normalizeSlug("Hello World!")    -> "hello-world"
 *   normalizeSlug("  Áccêntš  ")     -> "cc-nt"
 *   normalizeSlug("My--Slug__Test")  -> "my-slug__test"
 */
export function normalizeSlug(input: string): string {
	if (!input) {
		return '';
	}
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_\.]/g, '-')
		.replace(/--+/g, '-') // collapse multiple dashes
		.replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}

export async function user_and_domain(domain_id: number): Promise<{ user: api_user; domain: api_domain }> {
	const domain = await api_domain.findByPk(domain_id);
	if (!domain) {
		throw new Error(`Unable to look up domain ${domain_id}`);
	}
	const user = await api_user.findByPk(domain.user_id);
	if (!user) {
		throw new Error(`Unable to look up user ${domain.user_id}`);
	}
	return { user, domain };
}

type HeaderValue = string | string[] | undefined | null;

function collectHeaderIps(header: string | string[] | undefined): string[] {
	if (!header) {
		return [];
	}
	if (Array.isArray(header)) {
		return header
			.join(',')
			.split(',')
			.map((ip) => ip.trim())
			.filter(Boolean);
	}
	return header
		.split(',')
		.map((ip) => ip.trim())
		.filter(Boolean);
}

function resolveHeader(headers: Record<string, unknown>, key: string): string | string[] | undefined {
	const direct = headers[key];
	const alt = headers[key.toLowerCase()];
	const value = direct ?? alt;
	if (typeof value === 'string' || Array.isArray(value)) {
		return value;
	}
	return undefined;
}

interface RequestLike {
	headers?: Record<string, HeaderValue>;
	ip?: string | null;
	socket?: { remoteAddress?: string | null } | null;
}

/**
 * Collect informational request metadata (client IP, IP chain, timestamp) for
 * use in template rendering context.  The values are **not** used for security
 * decisions such as rate limiting — those rely on `getClientIp()` which is
 * trust-proxy aware.  For the IP chain to be meaningful the server must sit
 * behind a trusted reverse proxy that sets the forwarded headers.
 */
export function buildRequestMeta(rawReq: unknown): RequestMeta {
	const req = (rawReq ?? {}) as RequestLike;
	const headers = req.headers ?? {};
	const ips: string[] = [];
	ips.push(...collectHeaderIps(resolveHeader(headers, 'x-forwarded-for')));
	const realIp = resolveHeader(headers, 'x-real-ip');
	if (typeof realIp === 'string' && realIp.trim()) {
		ips.push(realIp.trim());
	}
	const cfIp = resolveHeader(headers, 'cf-connecting-ip');
	if (typeof cfIp === 'string' && cfIp.trim()) {
		ips.push(cfIp.trim());
	}
	const fastlyIp = resolveHeader(headers, 'fastly-client-ip');
	if (typeof fastlyIp === 'string' && fastlyIp.trim()) {
		ips.push(fastlyIp.trim());
	}
	if (req.ip && req.ip.trim()) {
		ips.push(req.ip.trim());
	}
	const remoteAddress = req.socket?.remoteAddress;
	if (remoteAddress) {
		ips.push(remoteAddress);
	}

	const uniqueIps = ips.filter((ip, index) => ips.indexOf(ip) === index);
	const clientIp = uniqueIps[0] || '';

	return {
		client_ip: clientIp,
		received_at: new Date().toISOString(),
		ip_chain: uniqueIps
	};
}

export function decodeComponent(value: string | string[] | undefined): string {
	if (!value) {
		return '';
	}
	const decoded = Array.isArray(value) ? (value[0] ?? '') : value;
	if (!decoded) {
		return '';
	}
	try {
		return decodeURIComponent(decoded);
	} catch {
		return decoded;
	}
}

export function getBodyValue(body: Record<string, unknown>, ...keys: string[]): string {
	for (const key of keys) {
		const value = body[key];
		if (Array.isArray(value) && value.length > 0) {
			return String(value[0]);
		}
		if (value !== undefined && value !== null) {
			return String(value);
		}
	}
	return '';
}

export function normalizeBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'number') {
		return value !== 0;
	}
	const normalized = String(value ?? '')
		.trim()
		.toLowerCase();
	return ['true', '1', 'yes', 'on'].includes(normalized);
}
