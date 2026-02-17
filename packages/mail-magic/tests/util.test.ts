import { STARTUP_ERROR_MESSAGE } from '../src/index.js';
import { usesSqlitePragmas } from '../src/models/db.js';
import { envOptions } from '../src/store/envloader.js';
import { buildRequestMeta, normalizeSlug } from '../src/util.js';

import type { Sequelize } from 'sequelize';

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

	test('usesSqlitePragmas only for sqlite dialect', () => {
		const sqlite = { getDialect: () => 'sqlite' } as Pick<Sequelize, 'getDialect'>;
		const mysql = { getDialect: () => 'mysql' } as Pick<Sequelize, 'getDialect'>;
		expect(usesSqlitePragmas(sqlite)).toBe(true);
		expect(usesSqlitePragmas(mysql)).toBe(false);
	});

	test('startup error message uses current project name', () => {
		expect(STARTUP_ERROR_MESSAGE).toBe('Failed to start mail-magic:');
	});

	test('DB_TYPE env description is API-database specific', () => {
		expect(envOptions.DB_TYPE.description).toBe('Database type for the API database');
		expect(envOptions.DB_TYPE.description.includes('WP')).toBe(false);
	});
});
