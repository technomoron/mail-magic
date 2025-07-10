import { Sequelize, Model, DataTypes } from 'sequelize';

export interface api_domain_type {
	domain_id: number;
	user_id: number;
	domain: string;
	sender: string;
	deflocale: string;
	is_default: boolean;
}

export class api_domain extends Model {
	declare domain_id: number;
	declare user_id: number;
	declare domain: string;
	declare sender: string;
	declare deflocale: string;
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
			domain: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			sender: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			deflocale: {
				type: DataTypes.CHAR(32),
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
