import fs from 'fs';
import path from 'path';

import bcrypt from 'bcryptjs';
import nunjucks from 'nunjucks';
import { Sequelize } from 'sequelize';

import { loadTxTemplate } from '../util.js';

import { mailStore } from './../store/store.js';
import { init_api_domain, api_domain } from './domain.js';
import { init_api_template, api_template } from './template.js';
import { init_api_user, api_user } from './user.js';

async function generateHash(password: string): Promise<string> {
	const salt = bcrypt.genSaltSync(10);
	const hash = bcrypt.hashSync(password, salt);
	return hash;
}

async function upsert_data(store: mailStore) {
	const initfile = path.join(store.configpath, 'init-data.json');
	if (fs.existsSync(initfile)) {
		store.print_debug(`Loading init data from ${initfile}`);
		const data = await fs.promises.readFile(initfile, 'utf8');
		const records = JSON.parse(data);
		if (records.user) {
			for (const record of records.user) {
				store.print_debug('Creating user records');
				if (record.password) {
					record.password = await generateHash(record.password);
				}
				await api_user.upsert(record);
			}
		}
		if (records.domain) {
			store.print_debug('Creating domain records');
			for (const record of records.domain) {
				await api_domain.upsert(record);
			}
		}
		if (records.template) {
			store.print_debug('Creating template records');
			for (const record of records.template) {
				if (!record.template && record.template_file) {
					record.template = await loadTxTemplate(store, record.template_file);
				}
				await api_template.upsert(record);
			}
		}
		store.print_debug('Initdata upserted successfully.');
	} else {
		store.print_debug(`No init data file, trying ${initfile}`);
	}
}

export async function init_api_db(db: Sequelize, store: mailStore) {
	await init_api_user(db);
	await init_api_domain(db);
	await init_api_template(db);

	api_user.hasMany(api_domain, {
		foreignKey: 'user_id',
		sourceKey: 'user_id',
		as: 'domains'
	});

	api_user.hasMany(api_template, {
		foreignKey: 'user_id',
		sourceKey: 'user_id',
		as: 'templates'
	});

	api_domain.belongsTo(api_user, {
		foreignKey: 'user_id',
		targetKey: 'user_id',
		as: 'user'
	});

	api_domain.hasMany(api_template, {
		foreignKey: 'domain_id',
		sourceKey: 'domain_id',
		as: 'templates'
	});

	api_template.belongsTo(api_user, {
		foreignKey: 'user_id',
		targetKey: 'user_id',
		as: 'user'
	});

	api_template.belongsTo(api_domain, {
		foreignKey: 'domain_id',
		targetKey: 'domain_id',
		as: 'domain'
	});

	await db.query('PRAGMA foreign_keys = OFF');
	await db.sync({ alter: true, force: false });
	await db.query('PRAGMA foreign_keys = ON');

	await upsert_data(store);
	store.print_debug('API Database Initialized...');
}

export async function connect_api_db(store: mailStore): Promise<Sequelize> {
	console.log('DB INIT');

	const env = store.env;
	const dbparams: any = {
		logging: false, // env.DB_LOG ? console.log : false,
		dialect: env.DB_TYPE,
		dialectOptions: {
			charset: 'utf8mb4'
		},
		define: {
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci'
		}
	};
	if (env.DB_TYPE === 'sqlite') {
		dbparams.storage = env.DB_NAME + '.db';
	} else {
		dbparams.host = env.DB_HOST;
		dbparams.database = env.DB_NAME;
		dbparams.username = env.DB_USER;
		dbparams.password = env.DB_PASS;
	}
	const db = new Sequelize(dbparams);
	await db.authenticate();

	store.print_debug('API Database Connected');

	await init_api_db(db, store);
	return db;
}
