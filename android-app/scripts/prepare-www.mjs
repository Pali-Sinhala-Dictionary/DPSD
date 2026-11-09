// වෙබ් අඩවියේ ගොනු (repo එකේ මුල) android-app/www වෙත පිටපත් කරයි — ඇප් එක ඇතුළේ ඇත්තේ මෙම ගොනුයි.
// වෙබ් අඩවියට අදාළ නොවන / ඇප් එකට අවශ්‍ය නැති දෑ මඟ හරියි.
import { cpSync, rmSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', 'www');   // Windows ඇප් එක: node … prepare-www.mjs www
const SKIP = new Set(['.git', '.github', 'android-app', 'desktop-app', 'node_modules', '.well-known', 'README.md',
  '.nojekyll', '.gitignore', 'sw.js', 'CLAUDE.md', 'build.log']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0;
for (const name of readdirSync(root)) {
  if (SKIP.has(name)) continue;
  cpSync(join(root, name), join(out, name), { recursive: true });
  n++;
}
if (!existsSync(join(out, 'index.html'))) throw new Error('index.html not found in ' + root);
console.log(`www ready: ${n} items copied from ${root}`);
