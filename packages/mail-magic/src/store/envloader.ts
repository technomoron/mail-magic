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
	DB_FORCE_SYNC: {
		description: 'Whether to force sync on table definitions (ALTER TABLE)',
		type: 'boolean',
		default: false
	},
	API_URL: {
		description: 'Sets the public URL for the API (i.e. https://ml.example.com:3790)',
		default: 'http://localhost:3776'
	},
	API_BASE_PATH: {
		description: 'Base path prefix for API routes',
		default: '/api'
	},
	ASSET_PUBLIC_BASE: {
		description: 'Public base URL for asset hosting (origin or origin + path)',
		default: ''
	},
	SWAGGER_ENABLED: {
		description: 'Enable the Swagger/OpenAPI endpoint',
		type: 'boolean',
		default: false
	},
	SWAGGER_PATH: {
		description: 'Path to expose the Swagger/OpenAPI spec (default: /api/swagger when enabled)',
		default: ''
	},
	ADMIN_ENABLED: {
		description: 'Enable the optional admin UI and admin API module when available',
		default: false,
		type: 'boolean'
	},
	ADMIN_APP_PATH: {
		description: 'Optional path to the admin UI dist directory (or its parent)',
		default: ''
	},
	ASSET_ROUTE: {
		description: 'Route prefix exposed for config assets',
		default: '/asset'
	},
	CONFIG_PATH: {
		description: 'Path to directory where config files are located',
		default: './data/'
	},
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
		description: 'Path for attached files. Use {domain} to scope per domain.',
		default: './{domain}/uploads'
	},
	API_TOKEN_PEPPER: {
		description:
			'Server-side pepper used to HMAC API tokens before DB lookup. Keep it stable to preserve existing API keys.',
		required: true,
		transform: (raw: string) => {
			const value = String(raw ?? '').trim();
			if (value.length < 16) {
				throw new Error('API_TOKEN_PEPPER must be at least 16 characters');
			}
			return value;
		}
	}
});
