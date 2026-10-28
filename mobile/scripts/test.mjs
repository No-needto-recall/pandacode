// Explicit file enumeration works in both cmd.exe and POSIX shells; quoted globs on Node 22
// can silently report zero tests. Type stripping is opt-in before Node 22.18.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['tests', 'src/live', 'scripts'].flatMap(directory => readdirSync(new URL(`../${directory}/`, import.meta.url))
  .filter(name => /\.test\.(ts|mjs)$/.test(name)).map(name => `${directory}/${name}`));
if (!files.length) throw new Error('No mobile test files found.');
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
