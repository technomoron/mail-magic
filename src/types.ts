import { ApiRequest } from '@technomoron/api-server-base';
import { envConfig } from '@technomoron/env-loader';
import { Transporter } from 'nodemailer';
// import { Sequelize, Dialect } from 'sequelize';

import { api_domain } from './models/domain.js';
import { api_user } from './models/user.js';

export interface mailApiKey {
	uid: number;
}

export interface mailApiRequest extends ApiRequest {
	user?: api_user;
	domain?: api_domain;
	locale?: string;
}

export interface formType {
	rcpt: string;
	sender: string;
	subject: string;
	template: string;
}

export interface StoredFile {
	filename: string;
	path: string;
	cid?: string;
}
