import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

export const api_recipient_schema = z.object({
	recipient_id: z.number().int().nonnegative(),
	domain_id: z.number().int().nonnegative(),
	// Empty string means "domain-wide"; otherwise scope to a specific form_key.
	form_key: z.string().default(''),
	idname: z.string().min(1),
	email: z.string().min(1),
	name: z.string().default('')
});

export type api_recipient_type = z.infer<typeof api_recipient_schema>;

export class api_recipient extends Model {
	declare recipient_id: number;
	declare domain_id: number;
	declare form_key: string;
	declare idname: string;
	declare email: string;
	declare name: string;
}

export async function init_api_recipient(api_db: Sequelize): Promise<typeof api_recipient> {
	api_recipient.init(
		{
			recipient_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			domain_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'domain',
					key: 'domain_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			form_key: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			idname: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			email: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			}
		},
		{
			sequelize: api_db,
			tableName: 'recipient',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci',
			indexes: [
				{
					unique: true,
					fields: ['domain_id', 'form_key', 'idname']
				}
			]
		}
	);

	return api_recipient;
}
