// Actions → Run workflow හිදී දෙන version එක (උදා: 1.0.0) tauri.conf.json සහ Cargo.toml වෙත යොදයි.
// Windows MSI සීමා: පළමු අංක දෙක 0–255, තුන්වැන්න 0–65535.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const v = (process.env.APP_VERSION || '1.0.0').trim();
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
if (!m || +m[1] > 255 || +m[2] > 255 || +m[3] > 65535) {
  console.error(`Version must look like 1.0.0 (max 255.255.65535) — got "${v}"`); process.exit(1);
}
const conf = resolve(here, '..', 'src-tauri', 'tauri.conf.json');
const c = JSON.parse(readFileSync(conf, 'utf8')); c.version = v; writeFileSync(conf, JSON.stringify(c, null, 2) + '\n');
const cargo = resolve(here, '..', 'src-tauri', 'Cargo.toml');
writeFileSync(cargo, readFileSync(cargo, 'utf8').replace(/^version = "[^"]*"/m, `version = "${v}"`));
console.log('version set:', v);
