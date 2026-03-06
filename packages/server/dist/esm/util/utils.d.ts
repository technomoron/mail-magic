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
export declare function normalizeSlug(input: string): string;
export declare function user_and_domain(domain_id: number): Promise<{
    user: api_user;
    domain: api_domain;
}>;
/**
 * Collect informational request metadata (client IP, IP chain, timestamp) for
 * use in template rendering context.  The values are **not** used for security
 * decisions such as rate limiting — those rely on `getClientIp()` which is
 * trust-proxy aware.  For the IP chain to be meaningful the server must sit
 * behind a trusted reverse proxy that sets the forwarded headers.
 */
export declare function buildRequestMeta(rawReq: unknown): RequestMeta;
export declare function decodeComponent(value: string | string[] | undefined): string;
export declare function getBodyValue(body: Record<string, unknown>, ...keys: string[]): string;
export declare function normalizeBoolean(value: unknown): boolean;
