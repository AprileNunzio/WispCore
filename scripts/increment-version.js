import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Correct path to root package.json
const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const versionParts = pkgData.version.split('.').map(Number);
versionParts[2] = (versionParts[2] || 0) + 1;
const newVersion = versionParts.join('.');

pkgData.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf-8');

console.log(`\x1b[32m[WispCore Auto-Release]\x1b[0m Release incrementata a: \x1b[36mv${newVersion}\x1b[0m`);

// Sync version in src/version.ts
const versionTsPath = path.join(rootDir, 'src', 'version.ts');
fs.writeFileSync(versionTsPath, `export const APP_VERSION = '${newVersion}';\n`, 'utf-8');
