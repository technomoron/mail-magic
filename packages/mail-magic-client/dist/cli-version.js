"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePackageVersion = resolvePackageVersion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function resolvePackageVersion(options = {}) {
    const argv1 = options.argv1 ?? process.argv[1] ?? '';
    const cwd = options.cwd ?? process.cwd();
    const candidates = [
        argv1 ? path_1.default.resolve(path_1.default.dirname(argv1), '../package.json') : '',
        path_1.default.resolve(cwd, 'package.json'),
        path_1.default.resolve(cwd, 'packages/mail-magic-client/package.json')
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (!fs_1.default.existsSync(candidate)) {
            continue;
        }
        try {
            const raw = fs_1.default.readFileSync(candidate, 'utf8');
            const data = JSON.parse(raw);
            if (data.name === '@technomoron/mail-magic-client') {
                return typeof data.version === 'string' && data.version ? data.version : 'unknown';
            }
        }
        catch {
            // Try next candidate.
        }
    }
    return 'unknown';
}
