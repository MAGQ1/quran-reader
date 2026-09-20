// The Arabic scripts and English translations the app offers in its menu.
//
// To add another one later:
//   1. put its 114 per-surah files in a new folder under data/
//      (tools/build-data.js creates them in the right format)
//   2. add one entry to the matching list below
// The menu and the reader pick it up automatically.

var QuranSources = {
    scripts: [
        { id: "uthmani", label: "Uthmani", folder: "data/uthmani", fontFamily: "'Amiri Quran', serif" }
    ],

    translations: [
        { id: "sahih", label: "Sahih International", folder: "data/sahih" }
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
