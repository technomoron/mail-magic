#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RELEASE_API_URL = 'https://api.github.com/repos/technomoron/vscode-eslint-defaults/releases/latest';
const INSTALLER_ASSET_NAME = 'installer.tgz';

async function fetch_json(url) {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'vscode-eslint-defaults-lintconfig',
			Accept: 'application/vnd.github+json'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

async function download_asset(url, destination) {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'vscode-eslint-defaults-lintconfig'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	fs.writeFileSync(destination, buffer);
}

async function run() {
	const release = await fetch_json(RELEASE_API_URL);
	const assets = Array.isArray(release.assets) ? release.assets : [];
	const asset = assets.find((item) => item.name === INSTALLER_ASSET_NAME);

	if (!asset?.browser_download_url) {
		throw new Error('Latest release does not include installer.tgz.');
	}

	const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lintconfig-'));
	const tgz_path = path.join(temp_dir, INSTALLER_ASSET_NAME);
	const args = process.argv.slice(2);
	let exit_code = 0;

	try {
		await download_asset(asset.browser_download_url, tgz_path);
		execSync(`tar -xzf "${tgz_path}" -C "${process.cwd()}"`, { stdio: 'inherit' });

		const configure_path = path.join(process.cwd(), 'configure-eslint.cjs');
		if (!fs.existsSync(configure_path)) {
			throw new Error('configure-eslint.cjs not found after extraction.');
		}

		const result = spawnSync(process.execPath, [configure_path, ...args], { stdio: 'inherit' });
		if (result.status !== 0) {
			exit_code = result.status ?? 1;
		} else {
			fs.unlinkSync(configure_path);
		}
	} finally {
		fs.rmSync(temp_dir, { recursive: true, force: true });
	}

	if (exit_code !== 0) {
		process.exit(exit_code);
	}
}

run().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
