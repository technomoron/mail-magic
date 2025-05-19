import { apiRequest } from '@technomoron/api-server-base';
import { Sequelize, Dialect } from 'sequelize';

import { api_domain } from './models/domain.js';
import { api_user } from './models/user.js';

export interface mailApiRequest extends apiRequest {
	user?: api_user;
	domain?: api_domain;
	locale?: string;
}

export interface ImailStore {
	is_production: boolean;
	is_staging: boolean;
	is_development: boolean;
	api_url: string;
	api_host: string;
	api_port: number;
	swagger_enable: boolean;
	swagger_path: string;
	api_dbuser: string;
	api_dbpass: string;
	api_dbname: string;
	api_dbhost: string;
	api_dbtype: Dialect;
	api_dblog: boolean;
	api_db: Sequelize | null;
	jwt_secret: string;
	jwt_refresh: string;
	smtp_host: string;
	smtp_port: number;
	smtp_secure: boolean;
	smtp_tls_reject: boolean;
	smtp_user: string;
	smtp_password: string;
	keys: Record<string, any>;
	mailer: any;
}

export interface formType {
	rcpt: string;
	sender: string;
	subject: string;
	template: string;
}
