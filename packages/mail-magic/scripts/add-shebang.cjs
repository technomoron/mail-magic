const fs = require('node:fs');
const path = require('node:path');

const shebang = '#!/usr/bin/env node\n';
const target = path.join(__dirname, '..', 'dist', 'bin', 'mail-magic.js');

if (!fs.existsSync(target)) {
	console.warn(`add-shebang: ${target} not found`);
	process.exit(0);
}

const contents = fs.readFileSync(target, 'utf8');
if (contents.startsWith(shebang)) {
	process.exit(0);
}

fs.writeFileSync(target, shebang + contents, 'utf8');
