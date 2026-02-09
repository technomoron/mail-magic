import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMailMagicServer } from '../../packages/mail-magic/src/index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, 'data');

const envOverrides = {
	CONFIG_PATH: configPath,
	DB_TYPE: 'sqlite',
	DB_NAME: path.join(root, 'mailmagic.db'),
	DB_FORCE_SYNC: true,
	DB_AUTO_RELOAD: false,
	API_HOST: '127.0.0.1',
	API_PORT: 3776,
	API_URL: 'http://127.0.0.1:3776/api',
	ASSET_ROUTE: '/asset',
	API_TOKEN_PEPPER: 'example-token-pepper-value',
	UPLOAD_PATH: './{domain}/uploads',
	SMTP_HOST: '127.0.0.1',
	SMTP_PORT: 1025,
	SMTP_SECURE: false,
	SMTP_TLS_REJECT: false,
	DEBUG: false
};

const { vars } = await startMailMagicServer({ apiBasePath: '' }, envOverrides);
console.log(`mail-magic example server listening on ${vars.API_HOST}:${vars.API_PORT}`);
