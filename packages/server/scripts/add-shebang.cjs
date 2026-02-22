const fs = require('node:fs');
const path = require('node:path');

const shebang = '#!/usr/bin/env node\n';
const root = path.join(__dirname, '..', 'dist');
const target = path.join(root, 'esm', 'bin', 'mail-magic.js');
const cjsPackageJson = path.join(root, 'cjs', 'package.json');
const cjsEntry = path.join(root, 'cjs', 'index.js');
const cjsTypesEntry = path.join(root, 'cjs', 'index.d.ts');

const cjsOnly = process.argv.includes('--cjs-only');

function extractStartupErrorMessage() {
	const esmIndex = path.join(root, 'esm', 'index.js');
	try {
		const src = fs.readFileSync(esmIndex, 'utf8');
		const m = src.match(/STARTUP_ERROR_MESSAGE\s*=\s*(["'`])([^"'`]+)\1/);
		if (m) return m[2];
	} catch {
		// ignore — fall back to hardcoded value below
	}
	return 'Failed to start mail-magic:';
}

function ensureCjsCompatibilityLayer() {
	const cjsDir = path.dirname(cjsPackageJson);
	if (!fs.existsSync(cjsDir)) {
		fs.mkdirSync(cjsDir, { recursive: true });
	}
	if (!fs.existsSync(cjsPackageJson)) {
		fs.writeFileSync(cjsPackageJson, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
	}
	const startupMsg = extractStartupErrorMessage();
	const cjsSource = `'use strict';\n\nconst load = () => import('../esm/index.js');\n\nmodule.exports = {\n  STARTUP_ERROR_MESSAGE: ${JSON.stringify(startupMsg)},\n  createMailMagicServer: async (...args) => (await load()).createMailMagicServer(...args),\n  startMailMagicServer: async (...args) => (await load()).startMailMagicServer(...args)\n};\n`;
	fs.writeFileSync(cjsEntry, cjsSource, 'utf8');
	fs.writeFileSync(cjsTypesEntry, `export * from '../esm/index.js';\n`, 'utf8');
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
