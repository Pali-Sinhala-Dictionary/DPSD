    // සියලු ශබ්දකෝෂ Configuration (Oxford Dictionary ඉවත් කර ඇත)
    let availableDicts = [
        { id: 'pali', name: 'පාලි - සිංහල ශබ්දකෝෂය', path: 'dictionary.csv', enabled: true, data: [] },
        { id: 'sien', name: 'සිංහල - ඉංග්‍රීසි ශබ්දකෝෂය', path: 'sinhala_english.csv?v=1', enabled: true, data: [] }
    ];

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
                    word: (parts[colMap.word] || '').replace(/[0-9]/g, '').trim(),
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
                    word: (parts[offset] || '').replace(/[0-9]/g, '').trim(),
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

                        row.innerHTML = `
                            <div class="word-header">
                                <div class="word-header-left">
                                    ${item.type ? `<span class="word-type">${item.type}</span>` : ''}
                                    ${item.wordDivision ? `<span class="word-division">${item.wordDivision}</span>` : ''}
                                </div>
                                ${detailsBtnHtml}
                            </div>
                            <div style="margin-top:5px;">${item.meaning}</div>
                            <div id="details-${dict.id}-${item.id}" class="details-panel">
                                ${item.properNoun ? `<div class="proper-noun-desc">සංඥානාම: ${item.properNoun}</div>` : ''}
                                ${item.grammarDesc ? `<div class="grammar-desc">ව්‍යාකරණ: ${item.grammarDesc}</div>` : ''}
                                ${item.etymology ? `<div class="etymology-desc">නිරුක්තිය: ${item.etymology}</div>` : ''}
                            </div>
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
