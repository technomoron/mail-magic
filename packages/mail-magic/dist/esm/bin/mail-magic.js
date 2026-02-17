#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { startMailMagicServer } from '../index.js';
const args = process.argv.slice(2);
function usage(exitCode = 0) {
    const out = exitCode === 0 ? process.stdout : process.stderr;
    out.write(`Usage: mail-magic [--env PATH] [--config DIR]\n\n` +
        `Options:\n` +
        `  -e, --env PATH   Path to .env (defaults to ./.env)\n` +
        `  -c, --config DIR Config directory (overrides CONFIG_PATH)\n` +
        `  -h, --help       Show this help\n`);
    process.exit(exitCode);
}
let envPath;
let configPath;
for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
        usage(0);
    }
    if (arg === '-e' || arg === '--env') {
        const next = args[i + 1];
        if (!next) {
            console.error('Error: --env requires a path');
            usage(1);
        }
        envPath = next;
        i += 1;
        continue;
    }
    if (arg === '-c' || arg === '--config') {
        const next = args[i + 1];
        if (!next) {
            console.error('Error: --config requires a directory');
            usage(1);
        }
        configPath = next;
        i += 1;
        continue;
    }
    if (arg.startsWith('--env=')) {
        envPath = arg.slice('--env='.length);
        continue;
    }
    if (arg.startsWith('--config=')) {
        configPath = arg.slice('--config='.length);
        continue;
    }
    console.error(`Error: unknown option ${arg}`);
    usage(1);
}
const resolvedEnvPath = path.resolve(envPath || '.env');
if (!fs.existsSync(resolvedEnvPath)) {
    console.error(`Error: env file not found at ${resolvedEnvPath}`);
    process.exit(1);
}
let resolvedConfigPath;
if (configPath) {
    // Resolve the config dir relative to the .env directory (we chdir there next).
    resolvedConfigPath = path.resolve(path.dirname(resolvedEnvPath), configPath);
    if (!fs.existsSync(resolvedConfigPath)) {
        console.error(`Error: config dir not found at ${resolvedConfigPath}`);
        process.exit(1);
    }
    if (!fs.statSync(resolvedConfigPath).isDirectory()) {
        console.error(`Error: config path is not a directory: ${resolvedConfigPath}`);
        process.exit(1);
    }
}
process.chdir(path.dirname(resolvedEnvPath));
const result = dotenv.config({ path: resolvedEnvPath });
if (result.error) {
    console.error('Error: failed to load env file');
    console.error(result.error);
    process.exit(1);
}
async function main() {
    try {
        const envOverrides = resolvedConfigPath ? { CONFIG_PATH: resolvedConfigPath } : {};
        const { store, vars } = await startMailMagicServer({}, envOverrides);
        console.log(`Using config path: ${store.configpath}`);
        console.log(`mail-magic server listening on ${vars.API_HOST}:${vars.API_PORT}`);
    }
    catch (error) {
        console.error('Failed to start mail-magic server');
        console.error(error);
        process.exit(1);
    }
}
await main();
