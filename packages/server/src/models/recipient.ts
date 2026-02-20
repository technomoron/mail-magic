import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

export const api_recipient_schema = z
	.object({
		recipient_id: z.number().int().nonnegative().describe('Database primary key for the recipient record.'),
		domain_id: z.number().int().nonnegative().describe('Owning domain ID.'),
		// Empty string means "domain-wide"; otherwise scope to a specific form_key.
		form_key: z.string().default('').describe('Form key scope. Empty string means domain-wide recipient.'),
		idname: z.string().min(1).describe('Recipient identifier within the scope.'),
		email: z.string().min(1).describe('Recipient email address.'),
		name: z.string().default('').describe('Optional recipient display name.')
	})
	.describe('Recipient routing record for form submissions.');

export type api_recipient_input = z.input<typeof api_recipient_schema>;
export type api_recipient_type = z.output<typeof api_recipient_schema>;
export type api_recipient_creation_type = Omit<api_recipient_input, 'recipient_id'> & { recipient_id?: number };

// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_recipient extends Model<api_recipient_type, api_recipient_creation_type> {}

// Merge Zod-inferred attributes onto the Sequelize model instance type (avoids per-field `declare`).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface api_recipient extends api_recipient_type {}

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
