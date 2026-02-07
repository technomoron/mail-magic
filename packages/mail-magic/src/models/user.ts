import { createHmac } from 'node:crypto';

import { Sequelize, Model, DataTypes, Op } from 'sequelize';
import { z } from 'zod';

export const api_user_schema = z.object({
	user_id: z.number().int().nonnegative(),
	idname: z.string().min(1),
	token: z.string().min(1).optional(),
	token_hmac: z.string().min(1).optional(),
	name: z.string().min(1),
	email: z.string().email(),
	domain: z.number().int().nonnegative().nullable().optional(),
	locale: z.string().default('')
});

export type api_user_type = z.infer<typeof api_user_schema>;
export class api_user extends Model {
	declare user_id: number;
	declare idname: string;
	declare token: string;
	declare token_hmac: string | null;
	declare name: string;
	declare email: string;
	declare domain: number;
	declare locale: string;
}

export function apiTokenToHmac(token: string, pepper: string): string {
	return createHmac('sha256', pepper).update(token).digest('hex');
}

export async function migrateLegacyApiTokens(pepper: string): Promise<{ migrated: number; cleared: number }> {
	const users = await api_user.findAll({
		where: {
			token: {
				[Op.ne]: ''
			}
		}
	});

	let migrated = 0;
	let cleared = 0;

	for (const user of users) {
		const updates: Partial<{ token_hmac: string; token: string }> = { token: '' };
		if (!user.token_hmac && user.token) {
			updates.token_hmac = apiTokenToHmac(user.token, pepper);
			migrated += 1;
		}
		cleared += 1;
		await user.update(updates);
	}

	return { migrated, cleared };
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
			token_hmac: {
				type: DataTypes.STRING,
				allowNull: true,
				defaultValue: null
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
			collate: 'utf8mb4_unicode_ci',
			indexes: [
				{
					unique: true,
					fields: ['token_hmac']
				}
			]
		}
	);
	return api_user;
}
