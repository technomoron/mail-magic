import { api_domain } from './models/domain';
import { api_user } from './models/user';

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
 *   normalizeSlug("  Áccêntš  ")     -> "ccnt"
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
