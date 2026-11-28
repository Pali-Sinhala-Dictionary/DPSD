#!/usr/bin/env python3
# sw.js හි DATA_FILES අගයන් එක් එක් zip ගොනුවේ අන්තර්ගතයේ hash එකට (sha256 මුල් අකුරු 10) සකසයි.
# zip ගොනුවක් වෙනස් වූ විට පමණක් එහි අගය වෙනස් වේ → PWA එක එම ගොනුව පමණක් නැවත බාගනී.
# (කලින් මෙම අංකය අතින් වැඩි කළ යුතු වූ අතර, එය අමතක වූ විට PWA එකට අලුත් දත්ත නොලැබුණි.)
import hashlib, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parents[2]
sw = root / 'sw.js'
src = sw.read_text(encoding='utf-8')

m = re.search(r'const DATA_FILES = \{(.*?)\};', src, re.S)
if not m:
    sys.exit('sw.js: DATA_FILES block not found')

def stamp(match):
    name = match.group(2)
    f = root / name
    if not f.is_file():
        print(f'warning: {name} not found — left unchanged')
        return match.group(0)
    h = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
    print(f'{name}: {h}')
    return f"{match.group(1)}'{name}': '{h}'"

body = re.sub(r"(\s*)'([^']+\.zip)'\s*:\s*(?:'[^']*'|\d+)", stamp, m.group(1))
out = src[:m.start(1)] + body + src[m.end(1):]
if out != src:
    sw.write_text(out, encoding='utf-8')
    print('sw.js updated')
else:
    print('sw.js already up to date')
