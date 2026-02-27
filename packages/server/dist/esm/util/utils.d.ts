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
export declare function buildRequestMeta(rawReq: unknown): RequestMeta;
export declare function decodeComponent(value: string | string[] | undefined): string;
export declare function getBodyValue(body: Record<string, unknown>, ...keys: string[]): string;
export declare function normalizeBoolean(value: unknown): boolean;
