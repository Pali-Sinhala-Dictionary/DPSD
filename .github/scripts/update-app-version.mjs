// release එකක් publish කළ පසු app-version.json යාවත්කාලීන කරයි (ඇප් එකේ යාවත්කාලීන දැනුම්දීම මෙය කියවයි).
// භාවිතය: node update-app-version.mjs <app-version.json> <android|windows>
// env: VERSION, VERSION_CODE (android), URL, PAGE, SIZE (bytes), NOTES
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [file, platform] = process.argv.slice(2);
if (!file || !['android', 'windows'].includes(platform)) { console.error('usage: <file> <android|windows>'); process.exit(1); }
const e = process.env;
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const entry = {
  ...(platform === 'android' ? { versionCode: parseInt(e.VERSION_CODE, 10), versionName: e.VERSION } : { version: e.VERSION }),
  url: e.URL,
  page: e.PAGE,
  size: parseInt(e.SIZE || '0', 10) || 0,
  date: new Date().toISOString().slice(0, 10),
  notes: (e.NOTES || '').replace(/\\n/g, '\n').trim()
};
if (platform === 'android' && !(entry.versionCode > 0)) { console.error('VERSION_CODE missing'); process.exit(1); }
if (!entry.version && !entry.versionName) { console.error('VERSION missing'); process.exit(1); }
data[platform] = entry;
writeFileSync(file, JSON.stringify({ android: data.android ?? null, windows: data.windows ?? null }, null, 2) + '\n');
console.log(platform, JSON.stringify(entry));
