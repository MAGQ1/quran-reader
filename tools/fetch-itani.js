// fetch-itani.js -- get Talal Itani's translation from ClearQuran itself.
//
//   node tools/fetch-itani.js
//
// The Al Quran Cloud copy of this translation is an older revision of the text
// (for example 112:4 there says "nothing comparable", the current ClearQuran page
// says "none comparable"). The licence (CC BY-ND 4.0) says the text must stay
// unmodified, so the app uses the author's own current text: this script reads
// each surah page on clearquran.com and writes data/itani/NNN.json, one string per
// verse, with the wording exactly as published (only the HTML markup removed).
//
// Licence and credit: https://blog.clearquran.com/download
//   "Translation by Talal Itani, ClearQuran.com" - CC BY-ND 4.0.
//
// It makes 114 requests, one at a time with a short pause, to be polite to the site.

var https = require('https');
var fs = require('fs');
var path = require('path');

var DATA = path.join(__dirname, '..', 'com.magq.quranreader', 'data');
var OUT = path.join(DATA, 'itani');
var surahs = JSON.parse(fs.readFileSync(path.join(DATA, 'surahs.json'), 'utf8'));

function pad3(n) { return ('00' + n).slice(-3); }

function get(url, cb, redirects) {
    redirects = redirects || 0;
    https.get(url, { headers: { 'User-Agent': 'QuranReader-data-build (contact: MAGQ)' } }, function (res) {
        if ([301, 302, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location && redirects < 3) {
            res.resume();
            var target = new URL(res.headers.location, url).toString();
            if (new URL(target).hostname.replace(/^www\./, '') !== 'clearquran.com') {
                return cb(new Error(url + ' redirected away from clearquran.com to ' + target));
            }
            return get(target, cb, redirects + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return cb(new Error(url + ' -> HTTP ' + res.statusCode)); }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(chunks).toString('utf8')); });
    }).on('error', cb);
}

var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };

function decode(s) {
    return s.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
        .replace(/&([a-z]+);/gi, function (m, name) { return ENTITIES.hasOwnProperty(name) ? ENTITIES[name] : m; });
}

// The verses on a page look like:  <p><span>4. </span>And there is none comparable to Him.</p>
function parseVerses(html) {
    var re = /<p>\s*<span>\s*(\d+)\.\s*<\/span>([\s\S]*?)<\/p>/g;
    var verses = [];
    var m;
    while ((m = re.exec(html)) !== null) {
        var text = decode(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
        verses.push({ n: parseInt(m[1], 10), text: text });
    }
    return verses;
}

function fail(msg) { console.error('FAILED: ' + msg); process.exit(1); }

var results = [];
var different = 0;
var total = 0;
var examples = [];

function next(i) {
    if (i > 114) { return finish(); }
    get('https://www.clearquran.com/' + pad3(i) + '.html', function (err, html) {
        if (err) { return fail(err.message); }
        var verses = parseVerses(html);
        var expected = surahs[i - 1].count;
        if (verses.length !== expected) { return fail('surah ' + i + ': found ' + verses.length + ' verses, expected ' + expected); }
        verses.forEach(function (v, k) {
            if (v.n !== k + 1) { fail('surah ' + i + ': verse numbering broke at ' + (k + 1)); }
            if (!v.text) { fail('surah ' + i + ':' + v.n + ' is empty'); }
        });
        results[i] = verses.map(function (v) { return v.text; });

        // Compare with the copy currently on disk (from Al Quran Cloud), if there is one.
        var old = null;
        try { old = JSON.parse(fs.readFileSync(path.join(OUT, pad3(i) + '.json'), 'utf8')); } catch (e) { /* none yet */ }
        if (old) {
            results[i].forEach(function (t, k) {
                total++;
                if (old[k] !== t) {
                    different++;
                    if (examples.length < 6) { examples.push(i + ':' + (k + 1) + '\n    was: ' + old[k] + '\n    now: ' + t); }
                }
            });
        }
        process.stdout.write('.');
        setTimeout(function () { next(i + 1); }, 150);
    });
}

function finish() {
    console.log('\nAll 114 surahs read.');
    if (total) {
        console.log(different + ' of ' + total + ' verses differ from the previous copy.');
        examples.forEach(function (e) { console.log('  ' + e); });
    }
    fs.mkdirSync(OUT, { recursive: true });
    var count = 0;
    for (var i = 1; i <= 114; i++) {
        fs.writeFileSync(path.join(OUT, pad3(i) + '.json'), JSON.stringify(results[i]), 'utf8');
        count += results[i].length;
    }
    if (count !== 6236) { return fail('expected 6236 verses, got ' + count); }
    console.log('OK: wrote data/itani (' + count + ' verses).');
}

console.log('Reading clearquran.com ...');
next(1);
