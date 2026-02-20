import { Sequelize } from 'sequelize';
import { init_api_domain, api_domain } from './domain.js';
import { init_api_form, api_form } from './form.js';
import { importData } from './init.js';
import { init_api_recipient, api_recipient } from './recipient.js';
import { init_api_txmail, api_txmail } from './txmail.js';
import { init_api_user, api_user, migrateLegacyApiTokens } from './user.js';
export function usesSqlitePragmas(db) {
    return db.getDialect() === 'sqlite';
}
export async function init_api_db(db, store) {
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
    const useSqlitePragmas = usesSqlitePragmas(db);
    if (useSqlitePragmas) {
        await db.query('PRAGMA foreign_keys = OFF');
    }
    const alter = Boolean(store.vars.DB_SYNC_ALTER);
    store.print_debug(`DB sync: alter=${alter} force=${store.vars.DB_FORCE_SYNC}`);
    await db.sync({ alter, force: store.vars.DB_FORCE_SYNC });
    if (useSqlitePragmas) {
        await db.query('PRAGMA foreign_keys = ON');
    }
    await importData(store);
    try {
        const { migrated, cleared } = await migrateLegacyApiTokens(store.vars.API_TOKEN_PEPPER);
        if (migrated || cleared) {
            store.print_debug(`Migrated ${migrated} legacy API token(s) and cleared ${cleared} plaintext token(s).`);
        }
    }
    catch (err) {
        store.print_debug(`Failed to migrate legacy API tokens: ${err instanceof Error ? err.message : String(err)}`);
    }
    store.print_debug('API Database Initialized...');
}
export async function connect_api_db(store) {
    console.log('DB INIT');
    const env = store.vars;
    const dbparams = {
        logging: env.DB_LOG ? console.log : false,
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
    }
    else {
        dbparams.host = env.DB_HOST;
        dbparams.database = env.DB_NAME;
        dbparams.username = env.DB_USER;
        dbparams.password = env.DB_PASS;
    }
    const debugDbParams = { ...dbparams };
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
