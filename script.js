    // සියලු ශබ්දකෝෂ Configuration (Oxford Dictionary ඉවත් කර ඇත)
    let availableDicts = [
        { id: 'pali', name: 'පාලි - සිංහල ශබ්දකෝෂය', path: 'dictionary.zip', enabled: true, data: [] },
        { id: 'sien', name: 'සිංහල - ඉංග්‍රීසි ශබ්දකෝෂය', path: 'sinhala_english.zip', enabled: true, data: [] }
    ];

    // Path to the zipped, Sinhala-transliterated DPD-inflections CSV
    // (word,pos,cat,sub,num,headword). Bump ?v= whenever the file changes
    // so browsers/service-worker caches pick up the new version.
    // NOTE: this build targets GitHub Pages (a real online browser), so
    // client-side unzip via the built-in DecompressionStream API is safe
    // to use here — see unzipFirstEntry() below. (A separate offline-APK
    // build should use plain, uncompressed .csv files instead, since we
    // can't guarantee every WebView supports DecompressionStream.)
    const INFLECTION_DATA_PATH = 'inflections.zip?v=1';

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const suggestionsBox = document.getElementById('suggestionsBox');
    const resultsContainer = document.getElementById('resultsContainer');
    const initialMessage = document.getElementById('initialMessage');

    // --- Restore saved theme preference (runs immediately, before first paint settles) ---
    (function restoreTheme() {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
            const icon = document.getElementById('themeIcon');
            if (icon) icon.setAttribute('href', '#icon-sun');
        }
    })();

    // --- Restore saved zoom / text-size preference (runs immediately, before first paint settles) ---
    (function restoreZoom() {
        const savedZoom = localStorage.getItem('zoomLevel') || '100';
        const zoomTarget = document.querySelector('.container');
        if (zoomTarget) zoomTarget.style.zoom = savedZoom + '%';
    })();

    // --- App Init ---
    window.addEventListener('DOMContentLoaded', () => {
        renderDictSelector();
        loadAllActiveDicts();
        history.replaceState({ tab: 'home', title: 'පාලි සිංහල ශබ්දකෝෂය' }, '');

        // Wire up zoom slider
        const zoomSlider = document.getElementById('zoomSlider');
        const zoomValueLabel = document.getElementById('zoomValueLabel');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                applyZoomPreview(zoomSlider.value);
            });
            zoomSlider.addEventListener('change', () => {
                saveZoom(zoomSlider.value);
            });
        }
    });

    // --- CSV Load Logic ---
    function loadAllActiveDicts() {
        let activeDicts = availableDicts.filter(d => d.enabled);
        if (activeDicts.length === 0) {
            initialMessage.innerText = "කරුණාකර අවම වශයෙන් එක් ශබ්දකෝෂයක්වත් තෝරන්න.";
            return;
        }

        let loadedCount = 0;
        activeDicts.forEach(dict => {
            if (dict.data && dict.data.length > 0) {
                loadedCount++;
                checkReady(loadedCount, activeDicts.length);
            } else {
                fetchCSV(dict.path, (data) => {
                    dict.data = data || [];
                    loadedCount++;
                    checkReady(loadedCount, activeDicts.length);
                });
            }
        });
    }

    function checkReady(count, total) {
        if (count === total) {
            searchInput.disabled = false;
            searchBtn.disabled = false;
            searchInput.placeholder = "වචනයක් ටයිප් කරන්න...";
            initialMessage.innerText = "වචනයක් ඇතුළත් කර සොයන්න.";
        }
    }

    function fetchCSV(path, callback) {
        // A ".zip" (with or without a trailing ?v=... query string) holds a
        // single CSV file — unzipped client-side with the browser's native
        // DecompressionStream API (see unzipFirstEntry below), then parsed
        // exactly like a plain CSV.
        if (/\.zip(\?.*)?$/i.test(path)) {
            fetchZippedCSV(path, callback);
            return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("GET", path, true);
        // Force UTF-8 decoding regardless of what the server reports, so
        // Sinhala/Pali text is never mis-decoded.
        xhr.overrideMimeType('text/plain; charset=utf-8');
        xhr.onload = function () {
            if (xhr.status === 200 || xhr.status === 0) {
                callback(parseCSV(xhr.responseText));
            } else {
                callback([]);
            }
        };
        xhr.onerror = () => callback([]);
        xhr.send();
    }

    // ================================================================
    // Native ZIP reader (no external libraries). Every .zip we ship wraps
    // exactly ONE file, compressed either "stored" (method 0) or "deflate"
    // (method 8 — the default for Python's zipfile / most zip tools).
    // DEFLATE is decoded with the browser's own built-in
    // DecompressionStream('deflate-raw') — requires a reasonably modern
    // browser (Chrome/Edge/Safari from ~2021 onward, or Chromium-based
    // WebView 95+). Fine for GitHub Pages; an offline-APK build should
    // ship plain .csv files instead, since WebView support can't be
    // guaranteed on older Android versions.
    // ================================================================
    async function unzipFirstEntry(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.length;

        const EOCD_SIG = 0x06054b50;
        let eocdOffset = -1;
        const scanStart = Math.max(0, len - 65557); // 22-byte record + max 65535-byte comment
        for (let i = len - 22; i >= scanStart; i--) {
            if (view.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
        }
        if (eocdOffset === -1) throw new Error('not a valid zip file (EOCD not found)');

        const cdOffset = view.getUint32(eocdOffset + 16, true);
        const CD_SIG = 0x02014b50;
        if (view.getUint32(cdOffset, true) !== CD_SIG) throw new Error('central directory not found');

        const method = view.getUint16(cdOffset + 10, true);
        const compSize = view.getUint32(cdOffset + 20, true);
        const localHeaderOffset = view.getUint32(cdOffset + 42, true);

        const LFH_SIG = 0x04034b50;
        if (view.getUint32(localHeaderOffset, true) !== LFH_SIG) throw new Error('local file header not found');
        const lNameLen = view.getUint16(localHeaderOffset + 26, true);
        const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
        const compData = bytes.slice(dataStart, dataStart + compSize);

        if (method === 0) return compData; // stored, already raw
        if (method === 8) {
            const stream = new Blob([compData]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        throw new Error('unsupported zip compression method: ' + method);
    }

    function fetchZippedCSV(path, callback) {
        fetch(path)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then(buf => unzipFirstEntry(buf))
            .then(bytes => callback(parseCSV(new TextDecoder('utf-8').decode(bytes))))
            .catch(err => {
                console.error('Zipped CSV load failed:', path, err);
                callback([]);
            });
    }

    // --- Real CSV tokenizer (RFC4180-style) ---
    // A plain line.split(',') breaks the moment any field's own text
    // contains a comma (e.g. a meaning listing several synonyms) — those
    // rows silently get extra columns and everything after shifts out of
    // place. This walks the text character-by-character so quoted commas,
    // quoted newlines, and escaped "" quotes are all handled correctly.
    function tokenizeCSV(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        const len = text.length;
        let i = 0;

        while (i < len) {
            const ch = text[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += ch; i++; continue;
            }

            if (ch === '"') { inQuotes = true; i++; continue; }
            if (ch === ',') { row.push(field); field = ''; i++; continue; }
            if (ch === '\r') { i++; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += ch; i++;
        }
        if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
        return rows;
    }

    // Recognizes the dictionary.csv header and maps column names to
    // indices, so word/meaning/etc. are read by NAME, not by guessing at
    // position/ID-format. Returns null if the row doesn't look like a
    // known header (caller then falls back to flexible positional parsing).
    function detectHeaderMap(headerRow) {
        if (!headerRow || headerRow.length < 2) return null;
        const map = {};
        headerRow.forEach((raw, idx) => {
            const h = (raw || '').trim();
            const hl = h.toLowerCase();
            if (hl === 'original_id' || hl === 'id') map.id = idx;
            else if (h.indexOf('වචනය') !== -1 || hl === 'word') map.word = idx;
            else if (h.indexOf('කෙටි ව්‍යා') !== -1 || hl === 'type') map.type = idx;
            else if (h.indexOf('පද බෙදීම') !== -1) map.wordDivision = idx;
            else if (h.indexOf('තේරුම') !== -1 && h.indexOf('නිරුක්ති') === -1) map.meaning = idx;
            else if (hl === 'meaning') map.meaning = idx;
            else if (h.indexOf('සංඥා නාම') !== -1) map.properNoun = idx;
            else if (h.indexOf('ව්‍යාකරණ විස්තරය') !== -1) map.grammarDesc = idx;
            else if (h.indexOf('නිරුක්ති') !== -1) map.etymology = idx;
        });
        return (map.word !== undefined) ? map : null;
    }

    // --- Smart CSV Parser ---
    function parseCSV(text) {
        const rows = tokenizeCSV(text);
        if (!rows.length) return [];

        const result = [];
        const colMap = detectHeaderMap(rows[0]);
        const startRow = colMap ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
            const raw = rows[i];
            if (!raw || raw.length < 2) continue;

            // Normalize to a single canonical Unicode form (NFC) so that a
            // word typed/stored via a different tool or keyboard, which may
            // produce an equivalent but differently-composed sequence of
            // combining marks (e.g. hal kirima + following consonant),
            // still matches consistently at search time.
            const parts = raw.map(p => (p || '').trim().normalize('NFC'));

            let item;
            if (colMap) {
                // Known schema: read every field by its header name. This
                // works regardless of the ID column's format (numeric like
                // "42" or alphanumeric like "GAP4-173") since we never have
                // to guess which column the ID is in.
                item = {
                    id: (colMap.id !== undefined ? parts[colMap.id] : '') || String(i),
                    word: (parts[colMap.word] || '').replace(/\s*\d+(?:\.\d+)*\s*$/, '').trim(),
                    type: (colMap.type !== undefined ? parts[colMap.type] : '') || '',
                    wordDivision: (colMap.wordDivision !== undefined ? parts[colMap.wordDivision] : '') || '',
                    meaning: (colMap.meaning !== undefined ? parts[colMap.meaning] : '') || '',
                    properNoun: (colMap.properNoun !== undefined ? parts[colMap.properNoun] : '') || '',
                    grammarDesc: (colMap.grammarDesc !== undefined ? parts[colMap.grammarDesc] : '') || '',
                    etymology: (colMap.etymology !== undefined ? parts[colMap.etymology] : '') || ''
                };
            } else {
                // No recognizable header (e.g. a simpler word,meaning style
                // dictionary file): fall back to flexible column-count
                // handling, same idea as before but on properly quote-aware
                // tokenized fields instead of a naive comma split.
                let offset = 0;
                let id = String(i);
                if (parts.length > 1 && parts[0] !== '' && !isNaN(parts[0])) {
                    id = parts[0];
                    offset = 1;
                }
                item = {
                    id: id,
                    word: (parts[offset] || '').replace(/\s*\d+(?:\.\d+)*\s*$/, '').trim(),
                    type: '',
                    wordDivision: '',
                    meaning: '',
                    properNoun: '',
                    grammarDesc: '',
                    etymology: ''
                };
                const remaining = parts.length - offset;
                if (remaining === 2) {
                    item.meaning = parts[offset + 1] || '';
                } else if (remaining >= 3) {
                    item.type = parts[offset + 1] || '';
                    item.meaning = parts[offset + 2] || '';
                    item.properNoun = parts[offset + 3] || '';
                    item.grammarDesc = parts[offset + 4] || '';
                }
            }

            // Keep the entry as long as it has a word AND at least one
            // piece of actual content in ANY field — meaning, type,
            // proper-noun description, grammar note, or etymology. This
            // fixes rows that were being silently dropped just because
            // "meaning" and "type" happened to both be empty (common for
            // DPPN proper-noun rows where the content lives in properNoun /
            // grammarDesc / etymology instead).
            const hasContent = item.meaning || item.type || item.properNoun ||
                                item.grammarDesc || item.etymology || item.wordDivision;
            if (item.word && hasContent) {
                result.push(item);
            }
        }
        return result;
    }

    // ================================================================
    // Singlish -> Sinhala Transliteration Engine
    // Ported from the reference "Pali-Sinhala Dictionary" app's search
    // algorithm. Instead of doing one fragile sequential text replace,
    // it builds a lookup of every consonant+vowel-sign combination and,
    // for a given Singlish string, returns EVERY valid Sinhala spelling
    // it could correspond to. This correctly handles inherent vowels,
    // pili (vowel signs), rakaransaya/yansaya (්‍ර / ්‍ය) and the many
    // ways people casually romanize the same Sinhala letter.
    // ================================================================
    const singlish_vowels = [
        ['අ', 'a'], ['ආ', 'aa'], ['ඇ', 'ae'], ['ඈ', 'ae, aee'],
        ['ඉ', 'i'], ['ඊ', 'ii'], ['උ', 'u'], ['ඌ', 'uu'],
        ['එ', 'e'], ['ඒ', 'ee'], ['ඔ', 'o'], ['ඕ', 'oo'],
        ['ඓ', 'ai'], ['ඖ', 'ou'],
        ['ඍ', 'ru'], ['ඎ', 'ru, ruu'], ['ඏ', 'li'], ['ඐ', 'li, lii']
    ];

    const singlish_specials = [
        ['ඞ්', 'n'], ['ං', 'n, m'], ['ඃ', 'n, m']
    ];

    const singlish_consonants = [
        ['ක', 'k'], ['ග', 'g'], ['ච', 'c, ch'], ['ජ', 'j'], ['ඤ', 'n, kn'],
        ['ට', 't'], ['ඩ', 'd'], ['ණ', 'n'], ['ත', 'th, t'], ['ද', 'd'],
        ['න', 'n'], ['ප', 'p'], ['බ', 'b'], ['ම', 'm'], ['ය', 'y'],
        ['ර', 'r'], ['ල', 'l'], ['ව', 'v, w'], ['ශ', 'sh'], ['ෂ', 'sh'],
        ['ස', 's'], ['හ', 'h'], ['ළ', 'l'], ['ෆ', 'f'],
        ['ඛ', 'kh, k'], ['ඨ', 'th, t'], ['ඝ', 'gh, g'], ['ඟ', 'ng'],
        ['ඡ', 'ch, c'], ['ඣ', 'jh, j'], ['ඦ', 'nj'], ['ඪ', 'dh, d'], ['ඬ', 'nd'],
        ['ථ', 'th, t'], ['ධ', 'dh, d'], ['ඳ', 'nd'], ['ඵ', 'ph, p'], ['භ', 'bh, b'],
        ['ඹ', 'mb'], ['ඥ', 'gn']
    ];

    // [pili (vowel sign attached after a consonant), roman suffix]
    const singlish_combinations = [
        ['්', ''],       // ක්
        ['', 'a'],        // ක
        ['ා', 'a, aa'],   // කා
        ['ැ', 'ae'],
        ['ෑ', 'ae, aee'],
        ['ි', 'i'],
        ['ී', 'i, ii'],
        ['ු', 'u'],
        ['ූ', 'u, uu'],
        ['ෙ', 'e'],
        ['ේ', 'e, ee'],
        ['ෛ', 'ei'],
        ['ො', 'o'],
        ['ෝ', 'o, oo'],

        ['්‍ර', 'ra'],       // ක්‍ර
        ['්‍රා', 'ra, raa'],
        ['්‍රැ', 'rae'],
        ['්‍රෑ', 'rae, raee'],
        ['්‍රි', 'ri'],
        ['්‍රී', 'ri, rii'],
        ['්‍රෙ', 're'],
        ['්‍රේ', 're, ree'],
        ['්‍රෛ', 'rei'],
        ['්‍රො', 'ro'],
        ['්‍රෝ', 'ro, roo'],

        ['්‍ය', 'ya'],       // ක්‍ය
        ['්‍යා', 'ya, yaa'],
        ['්‍යැ', 'yae'],
        ['්‍යෑ', 'yae, yaee'],
        ['්‍යි', 'yi'],
        ['්‍යී', 'yi, yii'],
        ['්‍යු', 'yu'],
        ['්‍යූ', 'yu, yuu'],
        ['්‍යෙ', 'ye'],
        ['්‍යේ', 'ye, yee'],
        ['්‍යෛ', 'yei'],
        ['්‍යො', 'yo'],
        ['්‍යෝ', 'yo, yoo'],

        ['ෘ', 'ru'],
        ['ෲ', 'ru, ruu'],
        ['ෞ', 'au'],
        ['ෟ', 'li'],
        ['ෳ', 'li, lii']
    ];

    const singlishMapping = {};
    let maxSinglishKeyLen = 0;

    function addToSinglishMapping(values, pSinhStr, pRomanStr) {
        values.forEach(function (pair) {
            const sinh = pair[0] + pSinhStr;
            const romans = pair[1].split(',');
            const pRomans = pRomanStr.split(',');
            romans.forEach(function (romanRaw) {
                const roman = romanRaw.trim();
                pRomans.forEach(function (pRomanRaw) {
                    const pRoman = pRomanRaw.trim();
                    const mapIndex = roman + pRoman;
                    if (!mapIndex) return;
                    if (singlishMapping[mapIndex]) {
                        if (singlishMapping[mapIndex].indexOf(sinh) === -1) {
                            singlishMapping[mapIndex].push(sinh);
                        }
                    } else {
                        singlishMapping[mapIndex] = [sinh];
                        maxSinglishKeyLen = Math.max(mapIndex.length, maxSinglishKeyLen);
                    }
                });
            });
        });
    }

    (function buildSinglishMapping() {
        addToSinglishMapping(singlish_vowels, '', '');
        addToSinglishMapping(singlish_specials, '', '');
        singlish_combinations.forEach(function (combi) {
            addToSinglishMapping(singlish_consonants, combi[0], combi[1]);
        });
    })();

    function isSinglishQuery(str) {
        return /[a-zA-Z]/.test(str);
    }

    // Returns every possible Sinhala spelling for a Singlish string.
    // Memoized on the remaining suffix so it stays fast even for longer words.
    function getPossibleMatches(input) {
        const cache = {};
        function helper(str) {
            if (str === '') return [''];
            if (cache[str]) return cache[str];
            let matches = [];
            const startLen = Math.min(maxSinglishKeyLen, str.length);
            for (let len = startLen; len >= 1; len--) {
                const prefix = str.slice(0, len);
                const rest = str.slice(len);
                const prefixMappings = isSinglishQuery(prefix) ? singlishMapping[prefix] : [prefix];
                if (!prefixMappings) continue;
                const restMappings = helper(rest);
                prefixMappings.forEach(function (p) {
                    restMappings.forEach(function (r) {
                        matches.push(p + r);
                    });
                });
            }
            // Cap at every recursion level (not just the final result) so the
            // combinations don't multiply out of control on longer words.
            const unique = Array.from(new Set(matches)).slice(0, 60);
            cache[str] = unique;
            return unique;
        }
        // Guard against pathological input freezing the UI
        if (!input || input.length > 24) return [];
        return helper(input).slice(0, 300);
    }

    // ================================================================
    // DPD Inflection ("වර නැගීම") lookup
    // inflections.zip wraps a lean CSV (word,pos,cat,sub,num,headword —
    // every word already transliterated to Sinhala script). Fetched +
    // unzipped + indexed into a Map only the FIRST time someone actually
    // opens an inflection panel, so it never slows down initial load.
    // ================================================================
    let inflectionIndexPromise = null;

    function getInflectionIndex() {
        if (inflectionIndexPromise) return inflectionIndexPromise;
        inflectionIndexPromise = fetch(INFLECTION_DATA_PATH)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then(buf => unzipFirstEntry(buf))
            .then(bytes => {
                const text = new TextDecoder('utf-8').decode(bytes);
                const rows = tokenizeCSV(text);
                const index = new Map();
                // header: word,pos,cat,sub,num,headword — skip row 0
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r || r.length < 6) continue;
                    const headword = r[5];
                    const entry = { inflected: r[0], pos: r[1], category: r[2], subcase: r[3], number: r[4] };
                    let bucket = index.get(headword);
                    if (!bucket) { bucket = []; index.set(headword, bucket); }
                    bucket.push(entry);
                }
                return index;
            })
            .catch(err => {
                console.error('inflections.zip load failed:', err);
                inflectionIndexPromise = null; // allow retry on next open
                throw err;
            });
        return inflectionIndexPromise;
    }

    const INFL_CASE_ORDER = ['nom', 'acc', 'instr', 'dat', 'abl', 'gen', 'loc', 'voc'];
    const INFL_CASE_LABELS = { nom: 'පඨමා', acc: 'දුතියා', instr: 'තතියා', dat: 'චතුත්ථී', abl: 'පඤ්චමී', gen: 'ෂෂ්ඨී', loc: 'සප්තමී', voc: 'ආලපන' };
    const INFL_GENDER_ORDER = ['masc', 'fem', 'nt'];
    const INFL_GENDER_LABELS = { masc: 'පුල්ලිංග', fem: 'ඉත්ථීලිංග', nt: 'නපුංසකලිංග' };
    const INFL_NUMBER_LABELS = { sg: 'ඒක වචන', pl: 'බහු වචන' };
    const INFL_TENSE_ORDER = ['pr', 'imp', 'opt', 'perf', 'imperf', 'aor', 'fut', 'cond'];
    const INFL_TENSE_LABELS = { pr: 'වත්තමානා', imp: 'පඤ්චමී', opt: 'සත්තමී', perf: 'පරොක්ඛා', imperf: 'හියත්තනී', aor: 'අජ්ජතනී', fut: 'භවිස්සන්ති', cond: 'කාලාතිපත්ති' };
    const INFL_PERSON_ORDER = ['1st', '2nd', '3rd'];
    const INFL_PERSON_LABELS = { '1st': 'උත්තම පුරුෂ', '2nd': 'මධ්‍යම පුරුෂ', '3rd': 'ප්‍රථම පුරුෂ' };
    // Personal / dual pronouns (අහං, ත්වං, උභ ...) decline by PERSON, not
    // gender — DPD stores these as category=person, subcase=case (the
    // reverse of the verb table, where subcase is the person).
    const INFL_PRON_PERSON_ORDER = ['1st', '2nd', 'dual'];
    const INFL_PRON_PERSON_LABELS = { '1st': 'උත්තම පුරුෂ (මම)', '2nd': 'මධ්‍යම පුරුෂ (ඔබ)', 'dual': 'උභ (දෙදෙනා)' };

    function uniqueForms(rows) {
        return Array.from(new Set(rows.map(r => r.inflected))).join('<br>');
    }

    function buildInflectionTablesHTML(rows) {
        if (!rows || rows.length === 0) {
            return '<div class="inflection-empty">මෙම වචනයට වර නැගීම් දත්ත හමු නොවීය.</div>';
        }

        let html = '';

        // --- Nominal declension: one stacked table per gender present ---
        INFL_GENDER_ORDER.filter(g => rows.some(r => r.category === g)).forEach(g => {
            const genderRows = rows.filter(r => r.category === g);
            const caseRows = INFL_CASE_ORDER
                .map(c => ({
                    code: c,
                    sg: genderRows.filter(r => r.subcase === c && r.number === 'sg'),
                    pl: genderRows.filter(r => r.subcase === c && r.number === 'pl'),
                }))
                .filter(r => r.sg.length || r.pl.length);
            if (!caseRows.length) return;

            html += `<div class="inflection-group-title">${INFL_GENDER_LABELS[g]}</div>`;
            html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
            html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th></tr>`;
            caseRows.forEach(r => {
                html += `<tr><th>${INFL_CASE_LABELS[r.code]}</th><td>${r.sg.length ? uniqueForms(r.sg) : '—'}</td><td>${r.pl.length ? uniqueForms(r.pl) : '—'}</td></tr>`;
            });
            html += '</table></div>';
        });

        // --- Personal/dual pronoun declension: one table per person present ---
        INFL_PRON_PERSON_ORDER.filter(p => rows.some(r => r.category === p && INFL_CASE_ORDER.includes(r.subcase))).forEach(p => {
            const personRows = rows.filter(r => r.category === p && INFL_CASE_ORDER.includes(r.subcase));
            const caseRows = INFL_CASE_ORDER
                .map(c => ({
                    code: c,
                    sg: personRows.filter(r => r.subcase === c && r.number === 'sg'),
                    pl: personRows.filter(r => r.subcase === c && r.number === 'pl'),
                }))
                .filter(r => r.sg.length || r.pl.length);
            if (!caseRows.length) return;

            html += `<div class="inflection-group-title">${INFL_PRON_PERSON_LABELS[p]}</div>`;
            html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
            html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th></tr>`;
            caseRows.forEach(r => {
                html += `<tr><th>${INFL_CASE_LABELS[r.code]}</th><td>${r.sg.length ? uniqueForms(r.sg) : '—'}</td><td>${r.pl.length ? uniqueForms(r.pl) : '—'}</td></tr>`;
            });
            html += '</table></div>';
        });

        // --- Verb conjugation: ONE table, columns = sg/pl/reflexive-sg/reflexive-pl,
        // rows = tense × person (ප්‍රථම → මධ්‍යම → උත්තම within each tense) —
        // matching the DPD reference layout exactly. ---
        const verbRows = rows.filter(r => INFL_PERSON_ORDER.includes(r.subcase));
        if (verbRows.length) {
            const presentCategories = new Set(verbRows.map(r => r.category));
            const plainTenses = INFL_TENSE_ORDER.filter(t => presentCategories.has(t));
            const reflxTenses = INFL_TENSE_ORDER.filter(t => presentCategories.has('reflx ' + t));
            const hasReflx = reflxTenses.length > 0;
            // Row order follows tense group order; within a tense, person
            // is listed ප්‍රථම (3rd) → මධ්‍යම (2nd) → උත්තම (1st) පුරුෂ.
            const VERB_ROW_PERSON_ORDER = ['3rd', '2nd', '1st'];
            const tenseUnion = INFL_TENSE_ORDER.filter(t => plainTenses.includes(t) || reflxTenses.includes(t));

            if (tenseUnion.length) {
                html += '<div class="inflection-group-title">ක්‍රියා පදය</div>';
                html += '<div class="inflection-table-wrapper"><table class="inflection-table">';
                html += `<tr><th class="inflection-corner"></th><th>${INFL_NUMBER_LABELS.sg}</th><th>${INFL_NUMBER_LABELS.pl}</th>`;
                if (hasReflx) html += `<th>ආත්ම. ${INFL_NUMBER_LABELS.sg}</th><th>ආත්ම. ${INFL_NUMBER_LABELS.pl}</th>`;
                html += '</tr>';

                tenseUnion.forEach(tenseCode => {
                    VERB_ROW_PERSON_ORDER.forEach(person => {
                        const sgCell = verbRows.filter(r => r.category === tenseCode && r.subcase === person && r.number === 'sg');
                        const plCell = verbRows.filter(r => r.category === tenseCode && r.subcase === person && r.number === 'pl');
                        const rSgCell = hasReflx ? verbRows.filter(r => r.category === 'reflx ' + tenseCode && r.subcase === person && r.number === 'sg') : [];
                        const rPlCell = hasReflx ? verbRows.filter(r => r.category === 'reflx ' + tenseCode && r.subcase === person && r.number === 'pl') : [];
                        if (!sgCell.length && !plCell.length && !rSgCell.length && !rPlCell.length) return;

                        const rowLabel = `${INFL_TENSE_LABELS[tenseCode]} (${INFL_PERSON_LABELS[person]})`;
                        html += `<tr><th>${rowLabel}</th><td>${sgCell.length ? uniqueForms(sgCell) : '—'}</td><td>${plCell.length ? uniqueForms(plCell) : '—'}</td>`;
                        if (hasReflx) html += `<td>${rSgCell.length ? uniqueForms(rSgCell) : '—'}</td><td>${rPlCell.length ? uniqueForms(rPlCell) : '—'}</td>`;
                        html += '</tr>';
                    });
                });

                html += '</table></div>';
            }
        }

        return html || '<div class="inflection-empty">මෙම වචනයට වර නැගීම් දත්ත හමු නොවීය.</div>';
    }

    window.toggleInflection = function (id, headword) {
        const panel = document.getElementById(`inflection-${id}`);
        if (!panel) return;

        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        panel.classList.add('open');
        if (panel.dataset.loaded === '1') return; // already fetched, just re-showing

        panel.innerHTML = '<div class="inflection-loading">වර නැගීම් දත්ත පූරණය වෙමින්...</div>';
        getInflectionIndex()
            .then(index => {
                const rows = index.get(headword) || [];
                panel.innerHTML = buildInflectionTablesHTML(rows);
                panel.dataset.loaded = '1';
            })
            .catch(() => {
                panel.innerHTML = '<div class="inflection-empty">වර නැගීම් දත්ත පූරණය කළ නොහැකි විය.</div>';
            });
    };

    // --- Search Input & Suggestions ---
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const rawQuery = this.value.trim().toLowerCase().replace(/[0-9]/g, '').normalize('NFC');
        const possibleMatches = isSinglishQuery(rawQuery) ? getPossibleMatches(rawQuery) : [];

        suggestionsBox.innerHTML = "";
        if (rawQuery.length < 1) { 
            suggestionsBox.style.display = "none"; 
            return; 
        }

        searchTimeout = setTimeout(() => {
            const matches = new Set();
            availableDicts.filter(d => d.enabled).forEach(dict => {
                if (dict.data && Array.isArray(dict.data)) {
                    dict.data.forEach(item => {
                        if (!item || !item.word) return;
                        const w = item.word.toLowerCase();
                        if (w.startsWith(rawQuery) || possibleMatches.some(pm => w.startsWith(pm))) {
                            matches.add(item.word);
                        }
                    });
                }
            });

            const finalMatches = Array.from(matches).slice(0, 10);
            if (finalMatches.length > 0) {
                finalMatches.forEach(word => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerText = word;
                    div.onclick = () => {
                        searchInput.value = word;
                        suggestionsBox.style.display = "none";
                        performSearch(word, true);
                    };
                    suggestionsBox.appendChild(div);
                });
                suggestionsBox.style.display = "block";
            } else {
                suggestionsBox.style.display = "none";
            }
        }, 150);
    });

    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = "none";
        }
    });

    searchBtn.addEventListener('click', () => performSearch(searchInput.value.trim(), false));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            suggestionsBox.style.display = "none";
            performSearch(searchInput.value.trim(), false);
        }
    });

    // --- Search Logic ---
    function performSearch(query, exactOnly = false) {
        if (!query) return;
        const lowerQuery = query.toLowerCase().replace(/[0-9]/g, '').trim().normalize('NFC');
        const possibleMatches = isSinglishQuery(lowerQuery) ? getPossibleMatches(lowerQuery) : [];

        resultsContainer.innerHTML = "";
        let hasResults = false;

        availableDicts.filter(d => d.enabled).forEach(dict => {
            if (!dict.data || !Array.isArray(dict.data) || dict.data.length === 0) return;

            let matches = dict.data.filter(item => {
                if (!item || !item.word) return false;
                const w = item.word.toLowerCase().trim();
                return w === lowerQuery || possibleMatches.some(pm => w === pm);
            });

            if (matches.length === 0 && !exactOnly) {
                matches = dict.data.filter(item => {
                    if (!item || !item.word) return false;
                    const w = item.word.toLowerCase();
                    return w.includes(lowerQuery) || possibleMatches.some(pm => w.includes(pm));
                });
            }

            if (matches.length === 0 && !exactOnly) {
                matches = dict.data.filter(item => {
                    if (!item || !item.meaning) return false;
                    const m = item.meaning.toLowerCase();
                    return m.includes(lowerQuery) || possibleMatches.some(pm => m.includes(pm));
                });
            }

            if (matches.length > 0) {
                hasResults = true;
                const groupedByWord = {};
                matches.forEach(item => {
                    if (!groupedByWord[item.word]) groupedByWord[item.word] = [];
                    groupedByWord[item.word].push(item);
                });

                Object.keys(groupedByWord).forEach(mainWord => {
                    const items = groupedByWord[mainWord];
                    const card = document.createElement('div');
                    card.className = 'word-card';
                    card.innerHTML = `<div class="main-word-title">${mainWord} <span class="dict-tag">${dict.name}</span></div>`;

                    items.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'meaning-row';
                        let detailsBtnHtml = (item.properNoun || item.grammarDesc || item.etymology) ? `<button class="details-btn" onclick="toggleDetails('${dict.id}-${item.id}')">විස්තර <svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-info"></use></svg></button>` : '';
                        // Inflection ("වර නැගීම") lookup only applies to the Pali dictionary.
                        const safeHeadword = mainWord.replace(/'/g, "\\'");
                        let inflectionBtnHtml = (dict.id === 'pali') ? `<button class="inflection-btn" onclick="toggleInflection('${dict.id}-${item.id}', '${safeHeadword}')">වර නැගීම</button>` : '';

                        row.innerHTML = `
                            <div class="word-header">
                                <div class="word-header-left">
                                    ${item.type ? `<span class="word-type">${item.type}</span>` : ''}
                                    ${item.wordDivision ? `<span class="word-division">${item.wordDivision}</span>` : ''}
                                </div>
                                <div class="word-header-right">
                                    ${detailsBtnHtml}
                                    ${inflectionBtnHtml}
                                </div>
                            </div>
                            <div style="margin-top:5px;">${item.meaning}</div>
                            <div id="details-${dict.id}-${item.id}" class="details-panel">
                                ${item.properNoun ? `<div class="proper-noun-desc">සංඥානාම: ${item.properNoun}</div>` : ''}
                                ${item.grammarDesc ? `<div class="grammar-desc">ව්‍යාකරණ: ${item.grammarDesc}</div>` : ''}
                                ${item.etymology ? `<div class="etymology-desc">නිරුක්තිය: ${item.etymology}</div>` : ''}
                            </div>
                            ${inflectionBtnHtml ? `<div id="inflection-${dict.id}-${item.id}" class="inflection-panel"></div>` : ''}
                        `;
                        card.appendChild(row);
                    });
                    resultsContainer.appendChild(card);
                });
            }
        });

        if (!hasResults) {
            resultsContainer.innerHTML = '<div class="no-results">ගැලපෙන වචන කිසිවක් හමු නොවීය.</div>';
        }
    }

    // --- Tab Switching Logic ---
    function switchTab(tabId, titleText, fromPopState = false) {
        document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.bottom-nav .nav-item').forEach(el => {
            if(el.id !== 'themeToggleBtn') el.classList.remove('active');
        });

        document.getElementById(`tab-${tabId}`).classList.add('active');
        const activeNav = document.getElementById(`nav-${tabId}`);
        if(activeNav) activeNav.classList.add('active');

        document.getElementById('pageTitle').innerText = titleText;

        if (!fromPopState) {
            const currentTab = (history.state && history.state.tab) ? history.state.tab : 'home';

            if (tabId !== 'home') {
                if (currentTab === 'home') {
                    // Leaving the search page: push ONE history entry as the single "back stop".
                    history.pushState({ tab: tabId, title: titleText }, '');
                } else {
                    // Moving between other tabs: replace in place so the back stack
                    // never grows beyond that one entry — back always lands on home.
                    history.replaceState({ tab: tabId, title: titleText }, '');
                }
            } else if (currentTab !== 'home') {
                // Navigated to Home directly (not via back press): collapse the back-stop entry.
                history.replaceState({ tab: 'home', title: titleText }, '');
            }
        }
    }

    // --- Back Button Control ---
    window.addEventListener('popstate', function(e) {
        const tab = (e.state && e.state.tab) ? e.state.tab : 'home';
        const title = (e.state && e.state.title) ? e.state.title : 'පාලි සිංහල ශබ්දකෝෂය';
        switchTab(tab, title, true);
    });

    // --- Theme & Settings Functions ---
    function toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        document.getElementById('themeIcon').setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    // --- Zoom / Text Size Functions ---
    // Note: zoom is applied only to .container (the page content),
    // never to <html>/<body>, so the bottom-nav icon row stays a fixed size.
    function applyZoomPreview(value) {
        const zoomTarget = document.querySelector('.container');
        if (zoomTarget) zoomTarget.style.zoom = value + '%';
        const label = document.getElementById('zoomValueLabel');
        if (label) label.textContent = value + '%';
    }

    function saveZoom(value) {
        localStorage.setItem('zoomLevel', String(value));
    }

    window.openZoomPanel = function () {
        const overlay = document.getElementById('zoomOverlay');
        const zoomSlider = document.getElementById('zoomSlider');
        if (!overlay) return;
        const current = localStorage.getItem('zoomLevel') || '100';
        if (zoomSlider) zoomSlider.value = current;
        applyZoomPreview(current);
        overlay.classList.add('active');
    };

    window.closeZoomPanel = function (e) {
        const overlay = document.getElementById('zoomOverlay');
        if (overlay) overlay.classList.remove('active');
    };

    function renderDictSelector() {
        const container = document.getElementById('dictList');
        if(!container) return;
        container.innerHTML = '';

        availableDicts.forEach((dict, index) => {
            const item = document.createElement('div');
            item.className = 'dict-item';
            item.innerHTML = `
                <label>
                    <input type="checkbox" ${dict.enabled ? 'checked' : ''} onchange="toggleDict(${index})">
                    <b>${dict.name}</b>
                </label>
                <div class="dict-controls">
                    <button onclick="moveDict(${index}, -1)" ${index === 0 ? 'disabled' : ''}><svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-arrow-up"></use></svg></button>
                    <button onclick="moveDict(${index}, 1)" ${index === availableDicts.length - 1 ? 'disabled' : ''}><svg class="icon-inline" viewBox="0 0 24 24"><use href="#icon-arrow-down"></use></svg></button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    window.toggleDict = function(index) {
        availableDicts[index].enabled = !availableDicts[index].enabled;
        loadAllActiveDicts();
    };

    window.moveDict = function(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= availableDicts.length) return;
        const temp = availableDicts[index];
        availableDicts[index] = availableDicts[newIndex];
        availableDicts[newIndex] = temp;
        renderDictSelector();
        if (searchInput.value.trim()) performSearch(searchInput.value.trim());
    };

    window.toggleDetails = (id) => {
        const panel = document.getElementById(`details-${id}`);
        panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
    };

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker Registered');
                reg.update();
            })
            .catch(err => {
                console.error('Service Worker Registration Failed:', err);
            });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
