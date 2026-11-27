// release එකක් publish කළ පසු app-version.json යාවත්කාලීන කරයි (ඇප් එකේ යාවත්කාලීන දැනුම්දීම මෙය කියවයි).
// භාවිතය: node update-app-version.mjs <app-version.json> <android_apk|windows>
// env: VERSION, VERSION_CODE (android_apk), URL, PAGE, SIZE (bytes), NOTES
//
// ⚠️ "android" කොටස 1.0.4 (version code 4) හි ස්ථිරව නවතා ඇත — එය කිසිවිටෙක වෙනස් නොකරන්න.
//    1.0.4 සහ ඊට පෙර ඇප් එය කියවා GitHub APK දැනුම්දීම පෙන්වයි; Play Store හි ඇති 1.0.4 ඇප් එකටද එය පෙනෙන නිසා
//    (Play ඇප් එකකට GitHub එකෙන් යාවත්කාලීන කිරීම Google Play නීතියට පටහැනියි), නව GitHub APK තොරතුරු "android_apk" කොටසට පමණි.
//    1.0.5 සිට ඇප් එක "android_apk" කියවයි — එයද Play Store එකෙන් ස්ථාපනය කළ ඇප් එකට නොපෙන්වයි.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [file, platform] = process.argv.slice(2);
if (!file || !['android_apk', 'windows'].includes(platform)) { console.error('usage: <file> <android_apk|windows>'); process.exit(1); }
const e = process.env;
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const entry = {
  ...(platform === 'android_apk' ? { versionCode: parseInt(e.VERSION_CODE, 10), versionName: e.VERSION } : { version: e.VERSION }),
  url: e.URL,
  page: e.PAGE,
  size: parseInt(e.SIZE || '0', 10) || 0,
  date: new Date().toISOString().slice(0, 10),
  notes: (e.NOTES || '').replace(/\\n/g, '\n').trim()
};
if (platform === 'android_apk' && !(entry.versionCode > 0)) { console.error('VERSION_CODE missing'); process.exit(1); }
if (!entry.version && !entry.versionName) { console.error('VERSION missing'); process.exit(1); }
data[platform] = entry;
writeFileSync(file, JSON.stringify({ android: data.android ?? null, android_apk: data.android_apk ?? null, windows: data.windows ?? null }, null, 2) + '\n');
console.log(platform, JSON.stringify(entry));
