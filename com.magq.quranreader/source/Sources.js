// The Arabic scripts and English translations the app offers in its menu.
//
// To add another one later:
//   1. put its 114 per-surah files in a new folder under data/
//      (tools/build-data.js creates them in the right format)
//   2. add one entry to the matching list below
// The menu and the reader pick it up automatically.
//
// Arabic scripts have two copies of the text:
//   folder        the plain Unicode text -- use this for searching
//   shapedFolder  the same words, pre-joined for display (tools/shape-arabic.py);
//                 the TouchPad cannot join Arabic letters itself
//   shapedExtra   shaped bismillah and surah names for the same script
// The shaped text needs the "Quran Shaped" font installed on the device.

var QuranSources = {
    scripts: [
        {
            id: "uthmani", label: "Uthmani",
            folder: "data/uthmani",
            shapedFolder: "data/uthmani-shaped",
            shapedExtra: "data/shaped-extra.json",
            fontFamily: "'Quran Shaped', serif"
        }
    ],

    // The first one is the default. A saved choice that no longer exists (for example
    // "sahih" from an older version) falls back to it.
    translations: [
        { id: "itani", label: "Talal Itani (Clear Quran)", folder: "data/itani" },
        { id: "pickthall", label: "Marmaduke Pickthall", folder: "data/pickthall" }
    ],

    // How the verse numbers after each Arabic verse are written.
    // (Menu labels use plain Latin text: the menu font has no Arabic digits.)
    numberStyles: [
        { id: "arabic", label: "Arabic-style numbers" },
        { id: "regular", label: "Regular numbers (1, 2, 3)" }
    ],

    // The first one is the default.
    themes: [
        { id: "light", label: "Light" },
        { id: "dark", label: "Dark" }
    ],

    // Recitation audio, streamed per-ayah from everyayah.com / VerseByVerseQuran.com
    // (see CREDITS.txt for the licence terms: free for non-commercial apps, credit
    // the reciter + site, do not alter the recordings). "folder" is the reciter's
    // folder name on the site; the file itself is <folder>/<SSSAAA>.mp3.
    reciters: [
        { id: "alafasy", label: "Mishary Alafasy", folder: "Alafasy_128kbps" },
        { id: "husary", label: "Mahmoud Al-Husary", folder: "Husary_128kbps" },
        { id: "abdulbasit", label: "Abdul Basit (Murattal)", folder: "Abdul_Basit_Murattal_192kbps" }
    ],

    // Extra silence between verses during continuous playback (on top of
    // however long the next verse's audio takes to fetch). The first one is
    // the default -- no extra pause beyond the fetch itself.
    pauseLengths: [
        { id: "none", label: "No pause", ms: 0 },
        { id: "short", label: "Short pause", ms: 700 },
        { id: "medium", label: "Medium pause", ms: 1500 },
        { id: "long", label: "Long pause", ms: 3000 }
    ],

    // Returns the entry with this id, or the first entry if the id is
    // unknown (e.g. a saved setting for a source that no longer exists).
    find: function (list, id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { return list[i]; }
        }
        return list[0];
    }
};
