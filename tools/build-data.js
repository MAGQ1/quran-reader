// Build script: downloads the Quran texts and splits them into small
// per-surah files the app can load quickly. Runs on your PC, not on the
// TouchPad, so it can use modern JavaScript.
//
//   node tools/build-data.js
//
// Sources:
//  - The Arabic texts (TANZIL_SCRIPTS: Uthmani, and Simple/Imla'ei) are downloaded
//    from tanzil.net ITSELF, as Tanzil publishes them: version 1.1, with pause marks,
//    sajdah and rub el hizb signs, and Tanzil's own "tatweel below superscript alefs"
//    option (الرَّحْمَـٰن).
//    The tatweel gives each small alif room of its own: without it, Amiri Quran
//    stacks the small alif, the fatha and the next letter's marks on top of each
//    other (seen on the device in 36:9, 36:23, 36:58 ...). It is used verbatim.
//    (Until 2026-10-11 the Arabic came from Al Quran Cloud, an older Tanzil 1.0.x
//    copy without the tatweels or Tanzil's 2021 corrections.)
//  - The English transliteration is Tanzil's own (TANZIL_TRANSLATIONS, from
//    tanzil.net/trans/), used verbatim, including its <u> <b> <i> formatting marks
//    (Reader.js draws only those as formatting). Tanzil's terms for its translations:
//    non-commercial use only -- this app is free and non-commercial. The similar
//    "en.transliteration" on Al Quran Cloud is a DIFFERENT text with no known author
//    or licence; do not use it.
//  - Surah names, revelation types, juz boundaries and Marmaduke Pickthall's
//    translation (public domain) come from api.alquran.cloud.
// Talal Itani's translation (CC BY-ND 4.0) does NOT: this script does not
// touch data/itani, which comes from ClearQuran itself (node tools/fetch-itani.js),
// because the Al Quran Cloud copy is an older revision with typos.
// See CREDITS.txt and data/NOTICE.txt.

var https = require('https');
var fs = require('fs');
var path = require('path');

var OUT = path.join(__dirname, '..', 'com.magq.quranreader', 'data');

// Each entry becomes data/<folder>/001.json ... 114.json
var EDITIONS = [
    { id: 'quran-uthmani', folder: 'uthmani' },   // only for names and juz; the Arabic text itself comes from TANZIL_SCRIPTS
    { id: 'en.pickthall',  folder: 'pickthall' }
];

// The English translations (folders under data/). Add a new one here and in
// EDITIONS above, and in source/Sources.js.
var TRANSLATIONS = ['pickthall'];

// The Arabic scripts, all from Tanzil. Each becomes data/<folder>/001.json ... 114.json,
// its Bismillah goes into data/bismillah.json under <folder>, and Tanzil's copyright
// block into data/TANZIL-HEADER-<folder>.txt. Add a new one here, in
// tools/shape-arabic.py (SCRIPTS) and in source/Sources.js.
var TANZIL_SCRIPTS = [
    { type: 'uthmani', folder: 'uthmani', title: 'Tanzil Quran Text (Uthmani' },
    { type: 'simple',  folder: 'simple',  title: 'Tanzil Quran Text (Simple' }
];

// Translations taken from Tanzil itself: data/<folder>/NNN.json, header in
// data/TANZIL-HEADER-<folder>.txt.
var TANZIL_TRANSLATIONS = [
    { id: 'en.transliteration', folder: 'translit' }
];

function tanzilTransUrl(id) {
    return 'https://tanzil.net/trans/?transID=' + id + '&type=txt-2';
}

// The only markup allowed in a Tanzil transliteration; anything else stops the build.
var TRANSLIT_TAGS = /<(\/?)(u|b|i|strong)>/gi;

function checkMarkup(text, where) {
    var stack = [];
    var rest = text.replace(TRANSLIT_TAGS, function (m, close, name) {
        name = name.toLowerCase();
        if (!close) { stack.push(name); } else { check(stack.pop() === name, 'unbalanced <' + name + '> at ' + where); }
        return '';
    });
    check(stack.length === 0, 'unclosed tag at ' + where);
    check(!/[<>&]/.test(rest), 'unexpected markup at ' + where);
}

function tanzilUrl(type) {
    return 'https://tanzil.net/pub/download/index.php?quranType=' + type + '&outType=txt-2' +
        '&marks=true&sajdah=true&rub=true&alef=true&tatweel=true&agree=true';
}

function getRaw(url, cb) {
    https.get(url, function (res) {
        if (res.statusCode !== 200) { return cb(new Error(url + ' -> HTTP ' + res.statusCode)); }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(chunks).toString('utf8')); });
    }).on('error', cb);
}

// Tanzil's "Text (with aya numbers)" file: one "surah|ayah|text" line per verse,
// then its copyright block as "#" lines (kept for data/TANZIL-HEADER-<folder>.txt).
function parseTanzil(raw) {
    var verses = {}, header = [], count = 0;
    raw.replace(/^﻿/, '').split(/\r?\n/).forEach(function (line) {
        if (line.charAt(0) === '#') { header.push(line); return; }
        var m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
        if (m) { verses[m[1] + ':' + m[2]] = m[3]; count++; }
    });
    return { verses: verses, header: header, count: count };
}

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
    var uth = results.uthmani;   // Al Quran Cloud: names, revelation types, juz
    var tanzil = results.tanzil; // folder -> parsed Tanzil text

    // Each script's Bismillah, taken from its own first verse of Al-Fatiha.
    var bismillahs = {};
    TANZIL_TRANSLATIONS.forEach(function (tr) {
        check(tanzil[tr.folder].count === 6236, tr.id + ': expected 6236 verses, got ' + tanzil[tr.folder].count);
        check(tanzil[tr.folder].header.join('\n').indexOf('ID: ' + tr.id) !== -1, tr.id + ': Tanzil header not found');
    });
    TANZIL_SCRIPTS.forEach(function (sc) {
        var t = tanzil[sc.folder];
        check(t.count === 6236, sc.type + ': expected 6236 Tanzil verses, got ' + t.count);
        check(t.header.join('\n').indexOf(sc.title) !== -1, sc.type + ': Tanzil copyright block not found');
        bismillahs[sc.folder] = t.verses['1:1'].trim();
    });

    var index = [];
    var stripped = {};
    var totalAyahs = 0;
    var juzStarts = {};

    uth.forEach(function (s, si) {
        check(s.number === si + 1, 'surah numbering at ' + (si + 1));
        TRANSLATIONS.forEach(function (folder) {
            var e = results[folder][si];
            check(e.number === si + 1, folder + ': surah numbering at ' + (si + 1));
            check(s.ayahs.length === e.ayahs.length, folder + ': ayah count mismatch in surah ' + s.number);
        });

        s.ayahs.forEach(function (a, ai) {
            check(a.numberInSurah === ai + 1, 'ayah numbering in surah ' + s.number);
            if (!juzStarts[a.juz]) { juzStarts[a.juz] = { juz: a.juz, surah: s.number, ayah: a.numberInSurah }; }
        });
        totalAyahs += s.ayahs.length;

        TANZIL_SCRIPTS.forEach(function (sc) {
            var arabic = s.ayahs.map(function (a, ai) {
                var t = tanzil[sc.folder].verses[s.number + ':' + (ai + 1)];
                check(t !== undefined, sc.type + ': Tanzil text has no verse ' + s.number + ':' + (ai + 1));
                // Surahs 2-114 (except 9) have the Bismillah glued onto verse 1.
                if (ai === 0 && s.number !== 1 && s.number !== 9) {
                    // Compare the first four words with diacritics removed: the
                    // source spells a few marks differently in some surahs (e.g. 95, 97).
                    var words = t.split(' ');
                    check(bare(words.slice(0, BISMILLAH_WORDS).join(' ')) === bare(bismillahs[sc.folder]),
                        sc.type + ': expected Bismillah prefix in surah ' + s.number);
                    t = words.slice(BISMILLAH_WORDS).join(' ');
                    stripped[sc.folder] = (stripped[sc.folder] || 0) + 1;
                }
                check(t.length > 0, sc.type + ': empty Arabic text at ' + s.number + ':' + (ai + 1));
                return t;
            });
            writeJson(path.join(OUT, sc.folder, pad3(s.number) + '.json'), arabic);
        });

        TANZIL_TRANSLATIONS.forEach(function (tr) {
            var lines = s.ayahs.map(function (a, ai) {
                var where = tr.id + ' ' + s.number + ':' + (ai + 1);
                var t = tanzil[tr.folder].verses[s.number + ':' + (ai + 1)];
                check(t !== undefined && t.length > 0, 'missing ' + where);
                checkMarkup(t, where);
                return t;
            });
            writeJson(path.join(OUT, tr.folder, pad3(s.number) + '.json'), lines);
        });

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
    TANZIL_SCRIPTS.forEach(function (sc) {
        check(stripped[sc.folder] === 112, sc.type + ': expected to strip 112 Bismillahs, stripped ' + stripped[sc.folder]);
    });

    writeJson(path.join(OUT, 'surahs.json'), index);
    writeJson(path.join(OUT, 'juz.json'), juz);
    writeJson(path.join(OUT, 'bismillah.json'), bismillahs);
    // Tanzil asks for its copyright block to go with every copy of the text.
    TANZIL_SCRIPTS.concat(TANZIL_TRANSLATIONS).forEach(function (sc) {
        fs.writeFileSync(path.join(OUT, 'TANZIL-HEADER-' + sc.folder + '.txt'),
            tanzil[sc.folder].header.join('\n') + '\n', 'utf8');
    });

    console.log('OK: 114 surahs, ' + totalAyahs + ' ayahs, 30 juz, Bismillahs moved to headers, scripts: ' +
        TANZIL_SCRIPTS.map(function (sc) { return sc.folder; }).join(', ') + '.');
}

// Downloads every Tanzil script in turn, then the Al Quran Cloud editions.
function downloadTanzil(i, acc) {
    var all = TANZIL_SCRIPTS.concat(TANZIL_TRANSLATIONS);
    if (i === all.length) { return build(EDITIONS, 0, { tanzil: acc }); }
    var sc = all[i];
    console.log('Downloading ' + (sc.type || sc.id) + ' from tanzil.net ...');
    getRaw(sc.type ? tanzilUrl(sc.type) : tanzilTransUrl(sc.id), function (err, raw) {
        check(!err, err && err.message);
        acc[sc.folder] = parseTanzil(raw);
        downloadTanzil(i + 1, acc);
    });
}

downloadTanzil(0, {});
