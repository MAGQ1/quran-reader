// The user's bookmarked verses, saved with QuranPrefs. Kept in Quran order
// (surah, then verse). Anything odd in the saved list (from an older version or a
// damaged store) is dropped on load, so a bad entry can never crash the app.

var QuranBookmarks = {
    key: "bookmarks",
    list: null,   // [{surah, ayah}], loaded on first use

    all: function () {
        if (this.list) { return this.list; }
        var saved = QuranPrefs.get(this.key, []);
        var seen = {};
        var clean = [];
        if (saved && saved.length) {
            for (var i = 0; i < saved.length; i++) {
                var b = saved[i];
                var s = b && parseInt(b.surah, 10);
                var a = b && parseInt(b.ayah, 10);
                if (s >= 1 && s <= 114 && a >= 1 && !seen[s + ":" + a]) {
                    seen[s + ":" + a] = true;
                    clean.push({surah: s, ayah: a});
                }
            }
        }
        this.list = this.sorted(clean);
        return this.list;
    },

    sorted: function (list) {
        return list.sort(function (x, y) { return (x.surah - y.surah) || (x.ayah - y.ayah); });
    },

    indexOf: function (surah, ayah) {
        var list = this.all();
        for (var i = 0; i < list.length; i++) {
            if (list[i].surah === surah && list[i].ayah === ayah) { return i; }
        }
        return -1;
    },

    has: function (surah, ayah) {
        return this.indexOf(surah, ayah) !== -1;
    },

    // Adds the verse if it is not bookmarked, removes it if it is. Returns true if it
    // is bookmarked afterwards.
    toggle: function (surah, ayah) {
        var i = this.indexOf(surah, ayah);
        if (i === -1) {
            this.list.push({surah: surah, ayah: ayah});
            this.sorted(this.list);
        } else {
            this.list.splice(i, 1);
        }
        QuranPrefs.set(this.key, this.list);
        return i === -1;
    },

    remove: function (surah, ayah) {
        if (this.has(surah, ayah)) { this.toggle(surah, ayah); }
    }
};
