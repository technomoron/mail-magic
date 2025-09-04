import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

import { normalizeSlug } from '../util';

import { api_domain } from './domain';

export const api_template_schema = z.object({
	template_id: z.number().int().nonnegative(),
	user_id: z.number().int().nonnegative(),
	domain_id: z.number().int().nonnegative(),
	name: z.string().min(1),
	locale: z.string().default(''),
	template: z.string().default(''),
	filename: z.string().default(''),
	sender: z.string().min(1),
	subject: z.string(),
	slug: z.string().default(''),
	part: z.boolean().default(false)
});

export type api_template_type = z.infer<typeof api_template_schema>;
export class api_template extends Model {
	declare template_id: number;
	declare user_id: number;
	declare domain_id: number;
	declare name: string;
	declare locale: string;
	declare template: string;
	declare filename: string;
	declare sender: string;
	declare subject: string;
	declare slug: string;
}

export async function init_api_template(api_db: Sequelize): Promise<typeof api_template> {
	api_template.init(
		{
			template_id: {
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
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: false
			},
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: '',
				unique: false
			},
			template: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			filename: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
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
			slug: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			part: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false
			}
		},
		{
			sequelize: api_db,
			tableName: 'template',
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

	api_template.addHook('beforeValidate', async (tpl: api_template) => {
		if (!tpl.slug || !tpl.filename) {
			const dom = await api_domain.findByPk(tpl.domain_id);
			if (!dom) throw new Error(`Domain not found for id ${tpl.domain_id}`);
			const safeDomain = normalizeSlug(dom.name);
			const safeName = normalizeSlug(tpl.name);
			const safeLocale = normalizeSlug(tpl.locale);
			tpl.slug = `${safeDomain}-${safeLocale ? safeLocale + '-' : ''}${safeName}`;

			if (!tpl.slug) {
				tpl.slug = `${dom.name}-${safeLocale ? safeLocale + '-' : ''}${safeName}`;
			}
			if (!tpl.filename) {
				tpl.filename = `${dom.name}/${safeLocale ? safeLocale + '/' : ''}${safeName}.njk`;
			}
			tpl.filename = tpl.filename + tpl.filename.endsWith('.njk') ? '' : '.njk';
		}
	});

	return api_template;
}
