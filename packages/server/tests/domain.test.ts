import { api_domain_schema } from '../src/models/domain.js';

describe('api_domain_schema', () => {
	test('rejects unsafe domain names', () => {
		expect(() => api_domain_schema.parse({ domain_id: 1, user_id: 1, name: '../evil' })).toThrow(/domain/i);
		expect(() => api_domain_schema.parse({ domain_id: 1, user_id: 1, name: 'evil/dir' })).toThrow(/domain/i);
		expect(() => api_domain_schema.parse({ domain_id: 1, user_id: 1, name: '' })).toThrow();
	});

	test('accepts common domain names', () => {
		expect(api_domain_schema.parse({ domain_id: 1, user_id: 1, name: 'example.test' }).name).toBe('example.test');
		expect(api_domain_schema.parse({ domain_id: 1, user_id: 1, name: 'sub.example-test_1' }).name).toBe(
			'sub.example-test_1'
		);
	});
});
