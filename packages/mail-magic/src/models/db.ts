import { Sequelize } from 'sequelize';

import { mailStore } from './../store/store.js';
import { init_api_domain, api_domain } from './domain.js';
import { init_api_form, api_form } from './form.js';
import { importData } from './init.js';
import { init_api_recipient, api_recipient } from './recipient.js';
import { init_api_txmail, api_txmail } from './txmail.js';
import { init_api_user, api_user, migrateLegacyApiTokens } from './user.js';

import type { Dialect, Options } from 'sequelize';

export async function init_api_db(db: Sequelize, store: mailStore) {
	await init_api_user(db);
	await init_api_domain(db);
	await init_api_txmail(db);
	await init_api_form(db);
	await init_api_recipient(db);

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
	api_user.hasMany(api_txmail, {
		foreignKey: 'user_id',
		as: 'txmail'
	});
	api_txmail.belongsTo(api_user, {
		foreignKey: 'user_id',
		as: 'user'
	});

	// Domain ↔ Template
	api_domain.hasMany(api_txmail, {
		foreignKey: 'domain_id',
		as: 'txmail'
	});
	api_txmail.belongsTo(api_domain, {
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

	// Domain ↔ Recipient (form recipient allowlist)
	api_domain.hasMany(api_recipient, {
		foreignKey: 'domain_id',
		as: 'recipients'
	});
	api_recipient.belongsTo(api_domain, {
		foreignKey: 'domain_id',
		as: 'domain'
	});

	await db.query('PRAGMA foreign_keys = OFF');
	store.print_debug(`Force alter tables: ${store.env.DB_FORCE_SYNC}`);
	await db.sync({ alter: true, force: store.env.DB_FORCE_SYNC });
	await db.query('PRAGMA foreign_keys = ON');

	await importData(store);

	try {
		const { migrated, cleared } = await migrateLegacyApiTokens(store.env.API_TOKEN_PEPPER);
		if (migrated || cleared) {
			store.print_debug(`Migrated ${migrated} legacy API token(s) and cleared ${cleared} plaintext token(s).`);
		}
	} catch (err) {
		store.print_debug(`Failed to migrate legacy API tokens: ${err instanceof Error ? err.message : String(err)}`);
	}
	store.print_debug('API Database Initialized...');
}

export async function connect_api_db(store: mailStore): Promise<Sequelize> {
	console.log('DB INIT');

	const env = store.env;
	const dbparams: Options = {
		logging: false, // env.DB_LOG ? console.log : false,
		dialect: env.DB_TYPE as Dialect,
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
	const debugDbParams: Record<string, unknown> = { ...dbparams };
	if (typeof debugDbParams.password === 'string' && debugDbParams.password) {
		debugDbParams.password = '<redacted>';
	}
	if (typeof debugDbParams.username === 'string' && debugDbParams.username) {
		debugDbParams.username = '<redacted>';
	}
	store.print_debug(`Database params are:\n${JSON.stringify(debugDbParams, undefined, 2)}`);
	const db = new Sequelize(dbparams);
	await db.authenticate();

	store.print_debug('API Database Connected');

	await init_api_db(db, store);
	return db;
}
