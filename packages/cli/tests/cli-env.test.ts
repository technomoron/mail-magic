import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, it } from 'vitest';

import { loadCliEnv, resolveToken } from '../src/cli-env';

it('loads defaults from .mmcli-env', () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-env-'));
	const envPath = path.join(tempDir, '.mmcli-env');
	fs.writeFileSync(
		envPath,
		[
			'# sample config',
			'MMCLI_API=http://localhost:4000',
			'MMCLI_USERNAME=alpha',
			'MMCLI_PASSWORD=alpha-token',
			'MMCLI_DOMAIN=alpha.example.test'
		].join('\n')
	);

	const defaults = loadCliEnv(tempDir);
	expect(defaults.api).toBe('http://localhost:4000');
	expect(defaults.username).toBe('alpha');
	expect(defaults.password).toBe('alpha-token');
	expect(defaults.domain).toBe('alpha.example.test');
	expect(resolveToken(defaults)).toBe('alpha:alpha-token');

	fs.rmSync(tempDir, { recursive: true, force: true });
});
