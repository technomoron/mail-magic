import { Sequelize } from 'sequelize';
import { z } from 'zod';

import { api_domain_schema, init_api_domain, api_domain } from '../src/models/domain.js';
import { api_form_schema, init_api_form, api_form } from '../src/models/form.js';
import { api_recipient_schema, init_api_recipient, api_recipient } from '../src/models/recipient.js';
import { api_txmail_schema, init_api_txmail, api_txmail } from '../src/models/txmail.js';
import { api_user_schema, init_api_user, api_user } from '../src/models/user.js';

import type { ModelStatic, Model } from 'sequelize';

function schemaKeys(schema: z.ZodTypeAny): string[] {
	if (!(schema instanceof z.ZodObject)) {
		throw new Error('Expected ZodObject schema');
	}
	return Object.keys(schema.shape).sort();
}

function modelKeys(model: ModelStatic<Model>): string[] {
	return Object.keys(model.getAttributes())
		.filter((key) => !['createdAt', 'updatedAt', 'deletedAt'].includes(key))
		.sort();
}

describe('schema/model consistency', () => {
	let db: Sequelize;

	beforeAll(async () => {
		db = new Sequelize('sqlite::memory:', { logging: false });
		await init_api_user(db);
		await init_api_domain(db);
		await init_api_form(db);
		await init_api_txmail(db);
		await init_api_recipient(db);
	});

	afterAll(async () => {
		await db.close();
	});

	test('api_user schema keys match Sequelize attributes', () => {
		expect(modelKeys(api_user as unknown as ModelStatic<Model>)).toEqual(schemaKeys(api_user_schema));
	});

	test('api_domain schema keys match Sequelize attributes', () => {
		expect(modelKeys(api_domain as unknown as ModelStatic<Model>)).toEqual(schemaKeys(api_domain_schema));
	});

	test('api_form schema keys match Sequelize attributes', () => {
		expect(modelKeys(api_form as unknown as ModelStatic<Model>)).toEqual(schemaKeys(api_form_schema));
	});

	test('api_txmail schema keys match Sequelize attributes', () => {
		expect(modelKeys(api_txmail as unknown as ModelStatic<Model>)).toEqual(schemaKeys(api_txmail_schema));
	});

	test('api_recipient schema keys match Sequelize attributes', () => {
		expect(modelKeys(api_recipient as unknown as ModelStatic<Model>)).toEqual(schemaKeys(api_recipient_schema));
	});
});
