// `npx cap add android` මගින් සාදන Android project එකට අපගේ සැකසුම් යොදයි:
//  • අයිකන / ආරම්භක තිරය (resources/res)   • versionCode / versionName
//  • GitHub Secrets හි keystore එක ඇත්නම් release signing
import { readFileSync, writeFileSync, cpSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..', 'android', 'app');
const resDir = join(appDir, 'src', 'main', 'res');
const must = (ok, msg) => { if (!ok) throw new Error('patch-android: ' + msg); };
must(existsSync(appDir), 'android/app not found — run `npx cap add android` first');

// 1) Capacitor ගේ පෙරනිමි splash.png සියල්ල ඉවත් කර, අපගේ අයිකන හා splash.xml යොදයි
for (const d of readdirSync(resDir)) {
  const f = join(resDir, d, 'splash.png');
  if (d.startsWith('drawable') && existsSync(f)) rmSync(f);
}
cpSync(resolve(here, '..', 'resources', 'res'), resDir, { recursive: true });

// 1b) ස්වදේශීය (Java) කේතය: MainActivity + AppBars plugin (තීරු වර්ණය)
const javaDir = join(appDir, 'src', 'main', 'java', 'com', 'pali_sinhala_dictionary', 'twa');
must(existsSync(join(javaDir, 'MainActivity.java')), 'MainActivity.java not found in ' + javaDir);
for (const f of ['MainActivity.java', 'AppBarsPlugin.java']) cpSync(resolve(here, '..', 'native', f), join(javaDir, f));

// 2) AndroidManifest: අමතර අවසර අවශ්‍ය නැත (ශබ්දකෝෂය සම්පූර්ණයෙන්ම offline; INTERNET Capacitor විසින්ම එක් කරයි)

// 3) app/build.gradle: අනුවාදය + signing
const gf = join(appDir, 'build.gradle');
let g = readFileSync(gf, 'utf8');
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10);
const vCode = parseInt(process.env.VERSION_CODE || String(100 + run), 10);   // Actions → Run workflow හිදී ඔබ දෙන අගය (Play හි අවසාන අගයට වඩා වැඩි විය යුතුය)
const vName = process.env.VERSION_NAME || `2.0.${run}`;
must(/versionCode\s*=?\s*\d+/.test(g), 'versionCode not found');
g = g.replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${vCode}`).replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${vName}"`);
if (!g.includes('signingConfigs')) {
  must(/buildTypes\s*\{/.test(g), 'buildTypes not found');
  g = g.replace(/(\n\s*)buildTypes\s*\{/, `$1signingConfigs {
        release {
            if (System.getenv("KS_FILE")) {
                storeFile = file(System.getenv("KS_FILE"))
                storePassword = System.getenv("KS_PASS")
                keyAlias = System.getenv("KS_ALIAS")
                keyPassword = System.getenv("KS_KEY_PASS")
            }
        }
    }$1buildTypes {`);
  must(/buildTypes\s*\{\s*release\s*\{/.test(g), 'buildTypes.release not found');
  g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            if (System.getenv("KS_FILE")) { signingConfig = signingConfigs.release }`);
  // පරීක්ෂණ (debug) ඇප් එක දැනට ඇති ඇප් එක ඉවත් නොකර වෙනම install කළ හැකි වීමට: com.pali_sinhala_dictionary.twa.debug
  if (!/\bdebug\s*\{/.test(g)) g = g.replace(/(buildTypes\s*\{)/, `$1\n        debug {\n            applicationIdSuffix = ".debug"\n            versionNameSuffix = "-test"\n        }`);
}
writeFileSync(gf, g);

console.log(`patched: versionCode=${vCode} versionName=${vName}, signing=${process.env.KS_FILE ? 'release keystore' : 'none (debug build)'}`);
const vg = resolve(here, '..', 'android', 'variables.gradle');
if (existsSync(vg)) console.log(readFileSync(vg, 'utf8').split('\n').filter(l => /SdkVersion/.test(l)).join('\n'));
