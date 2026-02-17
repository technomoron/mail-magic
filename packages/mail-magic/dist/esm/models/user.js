import { createHmac } from 'node:crypto';
import { Model, DataTypes, Op } from 'sequelize';
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
// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_user extends Model {
}
export function apiTokenToHmac(token, pepper) {
    return createHmac('sha256', pepper).update(token).digest('hex');
}
export async function migrateLegacyApiTokens(pepper) {
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
        const updates = { token: '' };
        if (!user.token_hmac && user.token) {
            updates.token_hmac = apiTokenToHmac(user.token, pepper);
            migrated += 1;
        }
        cleared += 1;
        await user.update(updates);
    }
    return { migrated, cleared };
}
export async function init_api_user(api_db) {
    await api_user.init({
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
    }, {
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
    });
    return api_user;
}
