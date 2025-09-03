import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

export const api_user_schema = z.object({
	user_id: z.number().int().nonnegative(),
	idname: z.string().min(1),
	token: z.string().min(1),
	name: z.string().min(1),
	email: z.string().email(),
	domain: z.number().int().nonnegative().optional(),
	locale: z.string()
});

export type api_user_type = z.infer<typeof api_user_schema>;
export class api_user extends Model {
	declare user_id: number;
	declare idname: string;
	declare token: string;
	declare name: string;
	declare email: string;
	declare domain: number;
	declare locale: string;
}

export async function init_api_user(api_db: Sequelize): Promise<typeof api_user> {
	await api_user.init(
		{
			user_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			idname: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			token: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			email: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			domain: {
				type: DataTypes.INTEGER,
				allowNull: true,
				references: {
					model: 'domain',
					key: 'domain_id'
				},
				onDelete: 'SET NULL',
				onUpdate: 'CASCADE',
				defaultValue: null
			},
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			}
		},
		{
			sequelize: api_db,
			tableName: 'user',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci'
		}
	);
	return api_user;
}
