import { defineEnvOptions } from '@technomoron/env-loader';

export const envOptions = defineEnvOptions({
	NODE_ENV: {
		description: 'Specifies the environment in which the app is running',
		options: ['development', 'production', 'staging'],
		default: 'development'
	},
	API_PORT: {
		description: 'Defines the port on which the app listens. Default 3780',
		default: '3776',
		type: 'number'
	},
	API_HOST: {
		description: 'Sets the local IP address for the API to listen at',
		default: '0.0.0.0'
	},
	DB_AUTO_RELOAD: {
		description: 'Reload init-data.db automatically on change',
		type: 'boolean',
		default: true
	},
	/*
	API_URL: {
		description: 'Sets the public URL for the API (i.e. https://ml.example.com:3790)',
		required: true
	},
	*/
	CONFIG_PATH: {
		description: 'Path to directory where config files are located',
		default: './config/'
	},
	/*
	SWAGGER_ENABLE: {
		description: 'Enable Swagger API docs',
		default: 'false',
		type: 'boolean'
	},
	SWAGGER_PATH: {
		description: 'Path for swagger api docs',
		default: '/api-docs'
	},
	*/
	/*
	JWT_SECRET: {
		description: 'Secret key for generating JWT access tokens',
		required: true
	},
	JWT_REFRESH: {
		description: 'Secret key for generating JWT refresh tokens',
		required: true
	},
	*/
	DB_USER: {
		description: 'Database username for API database'
	},
	DB_PASS: {
		description: 'Password for API database'
	},
	DB_NAME: {
		description: 'Name of API database. Filename for sqlite3, database name for others',
		default: 'maildata'
	},
	DB_HOST: {
		description: 'Host of API database',
		default: 'localhost'
	},
	DB_TYPE: {
		description: 'Database type of WP database',
		options: ['sqlite'],
		default: 'sqlite'
	},
	DB_LOG: {
		description: 'Log SQL statements',
		default: 'false',
		type: 'boolean'
	},
	DEBUG: {
		description: 'Enable debug output, including nodemailer and API',
		default: false,
		type: 'boolean'
	},
	SMTP_HOST: {
		description: 'Hostname of SMTP sending host',
		default: 'localhost'
	},
	SMTP_PORT: {
		description: 'SMTP host server port',
		default: 587,
		type: 'number'
	},
	SMTP_SECURE: {
		description: 'Use secure connection to SMTP host (SSL/TSL)',
		default: false,
		type: 'boolean'
	},
	SMTP_TLS_REJECT: {
		description: 'Reject bad cert/TLS connection to SMTP host',
		default: false,
		type: 'boolean'
	},
	SMTP_USER: {
		description: 'Username for SMTP host',
		default: ''
	},
	SMTP_PASSWORD: {
		description: 'Password for SMTP host',
		default: ''
	},
	UPLOAD_PATH: {
		description: 'Path for attached files',
		default: './uploads/'
	}
});
