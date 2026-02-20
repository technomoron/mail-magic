const fs = require('node:fs');
const path = require('node:path');

const shebang = '#!/usr/bin/env node\n';
const root = path.join(__dirname, '..', 'dist');
const target = path.join(root, 'esm', 'bin', 'mail-magic.js');
const cjsPackageJson = path.join(root, 'cjs', 'package.json');
const cjsEntry = path.join(root, 'cjs', 'index.js');
const cjsSource = `'use strict';

const load = () => import('../esm/index.js');

module.exports = {
  STARTUP_ERROR_MESSAGE: 'Failed to start mail-magic:',
  createMailMagicServer: async (...args) => (await load()).createMailMagicServer(...args),
  startMailMagicServer: async (...args) => (await load()).startMailMagicServer(...args)
};
`;

const cjsOnly = process.argv.includes('--cjs-only');

function ensureCjsCompatibilityLayer() {
	const cjsDir = path.dirname(cjsPackageJson);
	if (!fs.existsSync(cjsDir)) {
		fs.mkdirSync(cjsDir, { recursive: true });
	}
	if (!fs.existsSync(cjsPackageJson)) {
		fs.writeFileSync(cjsPackageJson, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
	}
	fs.writeFileSync(cjsEntry, cjsSource, 'utf8');
}

if (cjsOnly) {
	ensureCjsCompatibilityLayer();
	process.exit(0);
}

if (!fs.existsSync(target)) {
	console.warn(`add-shebang: ${target} not found`);
	ensureCjsCompatibilityLayer();
	process.exit(0);
}

const contents = fs.readFileSync(target, 'utf8');
if (contents.startsWith(shebang)) {
	process.exit(0);
}

fs.writeFileSync(target, shebang + contents, 'utf8');
ensureCjsCompatibilityLayer();
