import fs from 'node:fs';
import path from 'node:path';

export type CliDefaults = {
	api?: string;
	token?: string;
	username?: string;
	password?: string;
	domain?: string;
};

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function loadCliEnv(cwd: string = process.cwd()): CliDefaults {
	const envPath = path.join(cwd, '.mmcli-env');
	if (!fs.existsSync(envPath)) {
		return {};
	}
	const raw = fs.readFileSync(envPath, 'utf8');
	const values: Record<string, string> = {};

	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const index = trimmed.indexOf('=');
		if (index === -1) {
			continue;
		}
		const key = trimmed.slice(0, index).trim();
		const value = stripQuotes(trimmed.slice(index + 1));
		if (key) {
			values[key] = value;
		}
	}

	return {
		api: values.MMCLI_API || values.API,
		token: values.MMCLI_TOKEN,
		username: values.MMCLI_USERNAME || values.MMCLI_USER,
		password: values.MMCLI_PASSWORD || values.MMCLI_PASS,
		domain: values.MMCLI_DOMAIN
	};
}

export function resolveToken(defaults: CliDefaults): string | undefined {
	if (defaults.token) {
		return defaults.token;
	}
	if (defaults.username && defaults.password) {
		return `${defaults.username}:${defaults.password}`;
	}
	return undefined;
}
