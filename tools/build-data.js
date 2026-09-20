// Build script: downloads the Quran texts and splits them into small
// per-surah files the app can load quickly. Runs on your PC, not on the
// TouchPad, so it can use modern JavaScript.
//
//   node tools/build-data.js
//
// Source: api.alquran.cloud. The Uthmani text comes from the Tanzil project
// (tanzil.net) and Marmaduke Pickthall's translation (public domain) also comes
// from here. Talal Itani's translation (CC BY-ND 4.0) does NOT: this script does not
// touch data/itani, which comes from ClearQuran itself (node tools/fetch-itani.js),
// because the Al Quran Cloud copy is an older revision with typos.
// See CREDITS.txt and data/NOTICE.txt.

var https = require('https');
var fs = require('fs');
var path = require('path');

var OUT = path.join(__dirname, '..', 'com.magq.quranreader', 'data');

// Each entry becomes data/<folder>/001.json ... 114.json
var EDITIONS = [
    { id: 'quran-uthmani', folder: 'uthmani' },
    { id: 'en.pickthall',  folder: 'pickthall' }
];

// The English translations (folders under data/). Add a new one here and in
// EDITIONS above, and in source/Sources.js.
var TRANSLATIONS = ['pickthall'];

function get(url, cb) {
    https.get(url, function (res) {
        if (res.statusCode !== 200) { return cb(new Error(url + ' -> HTTP ' + res.statusCode)); }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
            try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch (e) { cb(e); }
        });
    }).on('error', cb);
}

function pad3(n) { return ('00' + n).slice(-3); }

// "Bismillah ir-Rahman ir-Rahim" is four words.
var BISMILLAH_WORDS = 4;

// Remove Arabic diacritics (harakat, shadda, sukun, superscript alef) so
// words can be compared by their letters alone.
function bare(s) { return s.replace(/[ً-ٰٟ]/g, ''); }

function check(cond, msg) {
    if (!cond) { console.error('CHECK FAILED: ' + msg); process.exit(1); }
}

function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj), 'utf8');
}

function build(editions, i, results) {
    if (i === editions.length) { return finish(results); }
    var ed = editions[i];
    console.log('Downloading ' + ed.id + ' ...');
    get('https://api.alquran.cloud/v1/quran/' + ed.id, function (err, json) {
        check(!err, err && err.message);
        check(json.status === 'OK' && json.data.surahs.length === 114, ed.id + ': expected 114 surahs');
        results[ed.folder] = json.data.surahs;
        build(editions, i + 1, results);
    });
}

function finish(results) {
    var uth = results.uthmani;

    // The Bismillah text, taken from the first verse of Al-Fatiha.
    var bismillah = uth[0].ayahs[0].text.replace(/^﻿/, '').trim();

    var index = [];
    var stripped = 0;
    var totalAyahs = 0;
    var juzStarts = {};

    uth.forEach(function (s, si) {
        check(s.number === si + 1, 'surah numbering at ' + (si + 1));
        TRANSLATIONS.forEach(function (folder) {
            var e = results[folder][si];
            check(e.number === si + 1, folder + ': surah numbering at ' + (si + 1));
            check(s.ayahs.length === e.ayahs.length, folder + ': ayah count mismatch in surah ' + s.number);
        });

        var arabic = s.ayahs.map(function (a, ai) {
            check(a.numberInSurah === ai + 1, 'ayah numbering in surah ' + s.number);
            var t = a.text.replace(/^﻿/, '');
            // Surahs 2-114 (except 9) have the Bismillah glued onto verse 1.
            if (ai === 0 && s.number !== 1 && s.number !== 9) {
                // Compare the first four words with diacritics removed: the
                // source spells a few marks differently in some surahs (e.g. 95, 97).
                var words = t.split(' ');
                check(bare(words.slice(0, BISMILLAH_WORDS).join(' ')) === bare(bismillah),
                    'expected Bismillah prefix in surah ' + s.number);
                t = words.slice(BISMILLAH_WORDS).join(' ');
                stripped++;
            }
            check(t.length > 0, 'empty Arabic text at ' + s.number + ':' + (ai + 1));
            if (!juzStarts[a.juz]) { juzStarts[a.juz] = { juz: a.juz, surah: s.number, ayah: a.numberInSurah }; }
            return t;
        });
        totalAyahs += arabic.length;
        writeJson(path.join(OUT, 'uthmani', pad3(s.number) + '.json'), arabic);
        TRANSLATIONS.forEach(function (folder) {
            var english = results[folder][si].ayahs.map(function (a, ai) {
                check(a.text.length > 0, folder + ': empty English text at ' + s.number + ':' + (ai + 1));
                return a.text;
            });
            writeJson(path.join(OUT, folder, pad3(s.number) + '.json'), english);
        });

        index.push({
            n: s.number,
            ar: s.name.replace(/^سُورَةُ\s*/, ''),   // name without the leading "Surah"
            en: s.englishName,
            tr: s.englishNameTranslation,
            type: s.revelationType,
            count: s.ayahs.length,
            bismillah: s.number !== 1 && s.number !== 9
        });
    });

    var juz = Object.keys(juzStarts).map(function (k) { return juzStarts[k]; })
        .sort(function (a, b) { return a.juz - b.juz; });

    check(totalAyahs === 6236, 'expected 6236 ayahs, got ' + totalAyahs);
    check(juz.length === 30, 'expected 30 juz, got ' + juz.length);
    check(stripped === 112, 'expected to strip 112 Bismillahs, stripped ' + stripped);

    writeJson(path.join(OUT, 'surahs.json'), index);
    writeJson(path.join(OUT, 'juz.json'), juz);
    writeJson(path.join(OUT, 'bismillah.json'), { text: bismillah });

    console.log('OK: 114 surahs, ' + totalAyahs + ' ayahs, 30 juz, ' + stripped + ' Bismillahs moved to headers.');
}

build(EDITIONS, 0, {});
