import { Sequelize } from 'sequelize';
import { mailStore } from '../store/store.js';
export declare function usesSqlitePragmas(db: Pick<Sequelize, 'getDialect'>): boolean;
export declare function init_api_db(db: Sequelize, store: mailStore): Promise<void>;
export declare function connect_api_db(store: mailStore): Promise<Sequelize>;
