import fs from 'fs';
import path from 'path';

type ResolveOptions = {
	argv1?: string;
	cwd?: string;
};

export function resolvePackageVersion(options: ResolveOptions = {}): string {
	const argv1 = options.argv1 ?? process.argv[1] ?? '';
	const cwd = options.cwd ?? process.cwd();
	const candidates = [
		argv1 ? path.resolve(path.dirname(argv1), '../package.json') : '',
		path.resolve(cwd, 'package.json'),
		path.resolve(cwd, 'packages/mm-cli/package.json')
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!fs.existsSync(candidate)) {
			continue;
		}
		try {
			const raw = fs.readFileSync(candidate, 'utf8');
			const data = JSON.parse(raw) as { version?: string; name?: string };
			if (data.name === '@technomoron/mail-magic-cli') {
				return typeof data.version === 'string' && data.version ? data.version : 'unknown';
			}
		} catch {
			// Try next candidate.
		}
	}

	return 'unknown';
}
