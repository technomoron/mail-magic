import { Sequelize, Model, DataTypes } from 'sequelize';

export class api_user extends Model {
	declare user_id: number;
	declare idname: string;
	declare token: string;
	declare name: string;
	declare email: string;
	declare defdomain: number;
	declare deflocale: string;
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
				type: DataTypes.CHAR(64),
				allowNull: false,
				defaultValue: ''
			},
			token: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			name: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			email: {
				type: DataTypes.CHAR(128),
				allowNull: false,
				defaultValue: ''
			},
			defdomain: {
				type: DataTypes.INTEGER,
				// allowNull: false,
				defaultValue: 0
			},
			deflocale: {
				type: DataTypes.CHAR(32),
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
