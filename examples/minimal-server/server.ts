import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMailMagicServer } from '../../packages/mail-magic/src/index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, 'data');

process.env.CONFIG_PATH ??= configPath;
process.env.DB_TYPE ??= 'sqlite';
process.env.DB_NAME ??= path.join(root, 'mailmagic.db');
process.env.DB_FORCE_SYNC ??= 'true';
process.env.DB_AUTO_RELOAD ??= 'false';
process.env.API_HOST ??= '127.0.0.1';
process.env.API_PORT ??= '3776';
process.env.API_URL ??= `http://${process.env.API_HOST}:${process.env.API_PORT}/api`;
process.env.ASSET_ROUTE ??= '/asset';
process.env.UPLOAD_PATH ??= './{domain}/uploads';
process.env.SMTP_HOST ??= '127.0.0.1';
process.env.SMTP_PORT ??= '1025';
process.env.SMTP_SECURE ??= 'false';
process.env.SMTP_TLS_REJECT ??= 'false';
process.env.DEBUG ??= 'false';

const { env } = await startMailMagicServer({ apiBasePath: '' });
console.log(`mail-magic example server listening on ${env.API_HOST}:${env.API_PORT}`);
