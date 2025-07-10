import { ApiRequest, ApiKey } from '@technomoron/api-server-base';
import { envConfig } from '@technomoron/env-loader';
import { Transporter } from 'nodemailer';
// import { Sequelize, Dialect } from 'sequelize';

import { api_domain } from './models/domain.js';
import { api_user } from './models/user.js';
import { envOptions } from './store/envloader.js';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface mailApiKey extends ApiKey {
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
