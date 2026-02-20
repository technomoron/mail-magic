import fs from 'node:fs';
import path from 'node:path';

import TemplateClient from '../../../packages/client/src/mail-magic-client.ts';

type Command = 'template' | 'asset' | 'path';

type Options = {
	apiUrl?: string;
	token?: string;
	files: string[];
	name?: string;
	domain?: string;
	sender?: string;
	subject?: string;
	locale?: string;
	path?: string;
	templateType?: 'tx' | 'form';
	template?: string;
};

const DEFAULT_BASE_URL = 'http://127.0.0.1:3776';

function usage(): void {
	const text = `Usage:
  mm-api.ts template --file <template.njk> --name <name> --domain <domain> [--sender "Name <email>"] [--subject <subject>] [--locale <locale>]
  mm-api.ts asset --file <file> --domain <domain> [--path <subdir>] [--template-type tx|form] [--template <name>] [--locale <locale>]
  mm-api.ts path --file <file> --domain <domain> --path <subdir> [--template-type tx|form] [--template <name>] [--locale <locale>]

Environment:
  MM_BASE_URL  Base API URL (default: http://127.0.0.1:3776)
  MM_API_URL   Alternate API URL (if set, /api is stripped)
  MM_TOKEN     API token (default: example-token)
  MM_DOMAIN    Default domain
`;
	console.log(text);
}

function normalizeBaseUrl(value: string): string {
	const trimmed = value.replace(/\/+$/, '');
	if (trimmed.endsWith('/api')) {
		return trimmed.slice(0, -4);
	}
	return trimmed;
}

function parseArgs(argv: string[]): { command: Command; options: Options } {
	if (argv.length < 3) {
		usage();
		throw new Error('Missing command');
	}
	const command = argv[2] as Command;
	if (command !== 'template' && command !== 'asset' && command !== 'path') {
		usage();
		throw new Error(`Unknown command: ${command}`);
	}

	const options: Options = { files: [] };
	let index = 3;
	while (index < argv.length) {
		const key = argv[index];
		const next = argv[index + 1];
		if (!key.startsWith('--')) {
			usage();
			throw new Error(`Unknown argument: ${key}`);
		}
		switch (key) {
			case '--file':
				if (!next) {
					throw new Error('Missing value for --file');
				}
				options.files.push(next);
				index += 2;
				break;
			case '--name':
				options.name = next;
				index += 2;
				break;
			case '--domain':
				options.domain = next;
				index += 2;
				break;
			case '--sender':
				options.sender = next;
				index += 2;
				break;
			case '--subject':
				options.subject = next;
				index += 2;
				break;
			case '--locale':
				options.locale = next;
				index += 2;
				break;
			case '--path':
				options.path = next;
				index += 2;
				break;
			case '--template-type':
				if (next !== 'tx' && next !== 'form') {
					throw new Error('template-type must be tx or form');
				}
				options.templateType = next;
				index += 2;
				break;
			case '--template':
				options.template = next;
				index += 2;
				break;
			case '--api':
				options.apiUrl = next;
				index += 2;
				break;
			case '--token':
				options.token = next;
				index += 2;
				break;
			case '--help':
				usage();
				process.exit(0);
				break;
			default:
				usage();
				throw new Error(`Unknown argument: ${key}`);
		}
	}

	return { command, options };
}

function resolveFileList(files: string[]): string[] {
	if (!files.length) {
		throw new Error('At least one --file is required');
	}
	const resolved: string[] = [];
	for (const file of files) {
		const fullPath = path.resolve(file);
		if (!fs.existsSync(fullPath)) {
			throw new Error(`File not found: ${file}`);
		}
		resolved.push(fullPath);
	}
	return resolved;
}

async function runTemplate(client: TemplateClient, options: Options): Promise<void> {
	if (!options.domain || !options.name) {
		throw new Error('template requires --domain and --name');
	}
	const [file] = resolveFileList(options.files);
	const template = fs.readFileSync(file, 'utf8');
	await client.storeTxTemplate({
		domain: options.domain,
		name: options.name,
		sender: options.sender,
		subject: options.subject,
		locale: options.locale,
		template
	});
	console.log(`Stored template '${options.name}' for ${options.domain}`);
}

async function runAsset(client: TemplateClient, options: Options): Promise<void> {
	if (!options.domain) {
		throw new Error('asset requires --domain');
	}
	const files = resolveFileList(options.files);
	await client.uploadAssets({
		domain: options.domain,
		files,
		templateType: options.templateType,
		template: options.template,
		locale: options.locale,
		path: options.path
	});
	console.log(`Uploaded ${files.length} asset(s) for ${options.domain}`);
}

async function main(): Promise<void> {
	const { command, options } = parseArgs(process.argv);
	const baseUrlRaw = options.apiUrl || DEFAULT_BASE_URL;
	const baseUrl = normalizeBaseUrl(baseUrlRaw);
	const token = options.token || 'example-token';
	const domain = options.domain || 'example.test';

	const client = new TemplateClient(baseUrl, token);
	const mergedOptions: Options = { ...options, domain };

	if (command === 'template') {
		await runTemplate(client, mergedOptions);
		return;
	}

	if (command === 'asset' || command === 'path') {
		if (command === 'path' && !mergedOptions.path) {
			throw new Error('path requires --path');
		}
		await runAsset(client, mergedOptions);
		return;
	}
}

main().catch((err) => {
	console.error('Error:', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
