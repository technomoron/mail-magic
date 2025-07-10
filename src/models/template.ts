import { Sequelize, Model, DataTypes } from 'sequelize';

export type api_template_type = {
	template_id: number;
	user_id: number;
	domain_id: number;
	name: string;
	locale: string;
	template: string;
	sender: string;
	subject: string;
	slug: string;
};

export class api_template extends Model {
	declare template_id: number;
	declare user_id: number;
	declare domain_id: number;
	declare name: string;
	declare locale: string;
	declare template: string;
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
				type: DataTypes.CHAR(64),
				allowNull: false,
				unique: false
			},
			locale: {
				type: DataTypes.CHAR(32),
				allowNull: false,
				defaultValue: '',
				unique: false
			},
			template: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: ''
			},
			sender: {
				type: DataTypes.CHAR(128),
				allowNull: false
			},
			subject: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			slug: {
				type: DataTypes.CHAR(128),
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

	api_template.addHook('beforeValidate', async (template: api_template) => {
		if (!template.slug) {
			template.slug = `${template.locale}-${template.name}`
				.toLowerCase()
				.replace(/[^a-z0-9-_]/g, '-')
				.replace(/--+/g, '-')
				.replace(/^-+|-+$/g, '');

			// template.slug = `${template.domain_id}-${template.locale}-${template.name}`
			//	.toLowerCase()
			//	.replace(/[^a-z0-9_-]/g, '-')
			//	.replace(/--+/g, '-')
			//	.replace(/^-+|-+$/g, '');

			console.log('Generated Slug (after upsert): ', template.slug);
		}
	});

	return api_template;
}
