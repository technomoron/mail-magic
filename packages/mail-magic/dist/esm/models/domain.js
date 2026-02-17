import { Model, DataTypes } from 'sequelize';
import { z } from 'zod';
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
export const api_domain_schema = z
    .object({
    domain_id: z.number().int().nonnegative().describe('Database primary key for the domain record.'),
    user_id: z.number().int().nonnegative().describe('Owning user ID.'),
    name: z
        .string()
        .min(1)
        .regex(DOMAIN_PATTERN, 'Invalid domain name')
        .describe('Domain name (config identifier).'),
    sender: z.string().default('').describe('Default sender address for this domain.'),
    locale: z.string().default('').describe('Default locale for this domain.'),
    is_default: z.boolean().default(false).describe('If true, this is the default domain for the user.')
})
    .describe('Domain configuration record.');
// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_domain extends Model {
}
export async function init_api_domain(api_db) {
    api_domain.init({
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
    }, {
        sequelize: api_db,
        tableName: 'domain',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    });
    return api_domain;
}
