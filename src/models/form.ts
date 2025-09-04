import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

import { normalizeSlug } from '../util';

import { api_domain } from './domain';

export const api_form_schema = z.object({
	form_id: z.number().int().nonnegative(),
	user_id: z.number().int().nonnegative(),
	domain_id: z.number().int().nonnegative(),
	locale: z.string().default(''),
	name: z.string().min(1),
	sender: z.string().min(1),
	subject: z.string(),
	template: z.string().default(''),
	filename: z.string().default(''),
	slug: z.string().default('')
});

export type api_form_type = z.infer<typeof api_form_schema>;

export class api_form extends Model {
	declare form_id: number;
	declare user_id: number;
	declare domain_id: number;
	declare locale: string;
	declare name: string;
	declare sender: string;
	declare subject: string;
	declare template: string;
	declare filename: string;
	declare slug: string;
}

export async function init_api_form(api_db: Sequelize): Promise<typeof api_form> {
	api_form.init(
		{
			form_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: false,
				references: {
					model: 'user',
					key: 'user_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			domain_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: false,
				references: {
					model: 'domain',
					key: 'domain_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: '',
				unique: false
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: false
			},
			sender: {
				type: DataTypes.STRING,
				allowNull: false
			},
			subject: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			filename: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			template: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: ''
			},
			slug: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			}
		},
		{
			sequelize: api_db,
			tableName: 'form',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci',
			indexes: [
				{
					unique: true,
					fields: ['user_id', 'domain_id', 'locale', 'name']
				}
			]
		}
	);

	api_form.addHook('beforeValidate', async (form: api_form) => {
		if (!form.slug || !form.filename) {
			const dom = await api_domain.findByPk(form.domain_id);
			if (!dom) throw new Error(`Domain not found for id ${form.domain_id}`);

			const safeName = normalizeSlug(form.name);

			const safeLocale = normalizeSlug(form.locale);

			if (!form.slug) {
				form.slug = `${dom.name}-${safeLocale ? safeLocale + '-' : ''}${safeName}`;
			}
			if (!form.filename) {
				form.filename = `${dom.name}/${safeLocale ? safeLocale + '/' : ''}${safeName}.njk`;
			}
			form.filename = form.filename + form.filename.endsWith('.njk') ? '' : '.njk';
		}
	});

	return api_form;
}
