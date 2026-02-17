"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCliEnv = loadCliEnv;
exports.resolveToken = resolveToken;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function stripQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function loadCliEnv(cwd = process.cwd()) {
    const envPath = node_path_1.default.join(cwd, '.mmcli-env');
    if (!node_fs_1.default.existsSync(envPath)) {
        return {};
    }
    const raw = node_fs_1.default.readFileSync(envPath, 'utf8');
    const values = {};
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
function resolveToken(defaults) {
    if (defaults.token) {
        return defaults.token;
    }
    if (defaults.username && defaults.password) {
        return `${defaults.username}:${defaults.password}`;
    }
    return undefined;
}
