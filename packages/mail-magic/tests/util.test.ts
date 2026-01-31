import { buildRequestMeta, normalizeSlug } from '../src/util.js';

describe('util', () => {
	test('normalizeSlug keeps safe characters and trims dashes', () => {
		expect(normalizeSlug('Hello World!')).toBe('hello-world');
		expect(normalizeSlug('  Áccêntš  ')).toBe('cc-nt');
		expect(normalizeSlug('My--Slug__Test')).toBe('my-slug__test');
		expect(normalizeSlug('---Already--Trimmed---')).toBe('already-trimmed');
	});

	test('buildRequestMeta prioritizes forwarded IPs', () => {
		const meta = buildRequestMeta({
			headers: {
				'x-forwarded-for': '203.0.113.10, 203.0.113.11',
				'x-real-ip': '203.0.113.12'
			},
			ip: '203.0.113.13',
			socket: { remoteAddress: '203.0.113.14' }
		});

		expect(meta.client_ip).toBe('203.0.113.10');
		expect(meta.ip_chain).toEqual(['203.0.113.10', '203.0.113.11', '203.0.113.12', '203.0.113.13', '203.0.113.14']);
	});
});
