import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, it } from 'vitest';

import { resolvePackageVersion } from '../src/cli-version';

it('resolves version from argv[1]-relative package.json', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-version-'));
	const distDir = path.join(root, 'dist');
	fs.mkdirSync(distDir, { recursive: true });
	const pkg = {
		name: '@technomoron/mail-magic-cli',
		version: '9.9.9'
	};
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2));
	const argv1 = path.join(distDir, 'cli.js');
	fs.writeFileSync(argv1, '');

	expect(resolvePackageVersion({ argv1, cwd: '/tmp/non-existent-cwd' })).toBe('9.9.9');

	fs.rmSync(root, { recursive: true, force: true });
});

it('falls back to unknown when no matching package.json exists', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcli-version-empty-'));
	expect(resolvePackageVersion({ argv1: path.join(root, 'dist', 'cli.js'), cwd: root })).toBe('unknown');
	fs.rmSync(root, { recursive: true, force: true });
});
