import { createHmac } from 'node:crypto';

import { Sequelize, Model, DataTypes, Op } from 'sequelize';
import { z } from 'zod';

export const api_user_schema = z
	.object({
		user_id: z.number().int().nonnegative().describe('Database primary key for the user record.'),
		idname: z.string().min(1).describe('User identifier (slug-like).'),
		token: z.string().min(1).optional().describe('Legacy API token (may be blank after migration).'),
		token_hmac: z.string().min(1).optional().describe('API token digest (HMAC).'),
		name: z.string().min(1).describe('Display name for the user.'),
		email: z.string().email().describe('User email address.'),
		domain: z.number().int().nonnegative().nullable().optional().describe('Default domain ID for the user.'),
		locale: z.string().default('').describe('Default locale for the user.')
	})
	.describe('User account record and API credentials.');

export type api_user_input = z.input<typeof api_user_schema>;
export type api_user_type = z.output<typeof api_user_schema>;
export type api_user_creation_type = Omit<api_user_input, 'user_id'> & { user_id?: number };

// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_user extends Model<api_user_type, api_user_creation_type> {}

// Merge Zod-inferred attributes onto the Sequelize model instance type (avoids per-field `declare`).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface api_user extends api_user_type {}

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
