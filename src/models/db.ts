import fs from 'fs';
import path from 'path';

import { Sequelize } from 'sequelize';
import { z } from 'zod';

import { mailStore } from './../store/store.js';
import { init_api_domain, api_domain, api_domain_schema } from './domain.js';
import { init_api_form, api_form, api_form_schema, upsert_form } from './form.js';
import { loadTxTemplate, loadFormTemplate, importData } from './init';
import { init_api_template, api_template, api_template_schema, upsert_template } from './template.js';
import { init_api_user, api_user, api_user_schema } from './user.js';

export async function init_api_db(db: Sequelize, store: mailStore) {
	await init_api_user(db);
	await init_api_domain(db);
	await init_api_template(db);
	await init_api_form(db);

	// User ↔ Domain
	api_user.hasMany(api_domain, {
		foreignKey: 'user_id',
		as: 'domains'
	});
	api_domain.belongsTo(api_user, {
		foreignKey: 'user_id',
		as: 'user'
	});

	// User ↔ Template
	api_user.hasMany(api_template, {
		foreignKey: 'user_id',
		as: 'templates'
	});
	api_template.belongsTo(api_user, {
		foreignKey: 'user_id',
		as: 'user'
	});

	// Domain ↔ Template
	api_domain.hasMany(api_template, {
		foreignKey: 'domain_id',
		as: 'templates'
	});
	api_template.belongsTo(api_domain, {
		foreignKey: 'domain_id',
		as: 'domain'
	});
	api_user.belongsTo(api_domain, {
		foreignKey: 'domain',
		as: 'defaultDomain'
	});
	api_domain.hasMany(api_user, {
		foreignKey: 'domain',
		as: 'usersWithDefault'
	});
	api_user.hasMany(api_form, {
		foreignKey: 'user_id',
		as: 'forms'
	});
	api_form.belongsTo(api_user, {
		foreignKey: 'user_id',
		as: 'user'
	});
	api_domain.hasMany(api_form, {
		foreignKey: 'domain_id',
		as: 'forms'
	});
	api_form.belongsTo(api_domain, {
		foreignKey: 'domain_id',
		as: 'domain'
	});

	await db.query('PRAGMA foreign_keys = OFF');
	store.print_debug(`Force alter tables: ${store.env.DB_FORCE_SYNC}`);
	await db.sync({ alter: true, force: store.env.DB_FORCE_SYNC });
	await db.query('PRAGMA foreign_keys = ON');

	await importData(store);
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
		dbparams.storage = env.DB_NAME.endsWith('.db') ? env.DB_NAME : `${env.DB_NAME}.db`;
	} else {
		dbparams.host = env.DB_HOST;
		dbparams.database = env.DB_NAME;
		dbparams.username = env.DB_USER;
		dbparams.password = env.DB_PASS;
	}
	store.print_debug(`Database params are:\n${JSON.stringify(dbparams, undefined, 2)}`);
	const db = new Sequelize(dbparams);
	await db.authenticate();

	store.print_debug('API Database Connected');

	await init_api_db(db, store);
	return db;
}
