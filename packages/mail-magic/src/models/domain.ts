import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export const api_domain_schema = z.object({
	domain_id: z.number().int().nonnegative(),
	user_id: z.number().int().nonnegative(),
	name: z.string().min(1).regex(DOMAIN_PATTERN, 'Invalid domain name'),
	sender: z.string().default(''),
	locale: z.string().default(''),
	is_default: z.boolean().default(false)
});

export type api_domain_type = z.infer<typeof api_domain_schema>;

export class api_domain extends Model {
	declare domain_id: number;
	declare user_id: number;
	declare name: string;
	declare sender: string;
	declare locale: string;
	declare is_default: boolean;
}

export async function init_api_domain(api_db: Sequelize): Promise<typeof api_domain> {
	api_domain.init(
		{
			domain_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				references: {
					model: 'user',
					key: 'user_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			sender: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			is_default: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false
			}
		},
		{
			sequelize: api_db,
			tableName: 'domain',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci'
		}
	);
	return api_domain;
}
