// Saves small settings (chosen script, translation, reading position) so
// they survive closing the app. Uses the browser's localStorage. Every call
// is wrapped in try/catch so a storage problem can never crash the app.

var QuranPrefs = {
    prefix: "quran.",

    get: function (key, fallback) {
        try {
            var raw = window.localStorage.getItem(this.prefix + key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            enyo.error("QuranPrefs.get failed for " + key + ": " + e);
            return fallback;
        }
    },

    set: function (key, value) {
        try {
            window.localStorage.setItem(this.prefix + key, JSON.stringify(value));
            return true;
        } catch (e) {
            enyo.error("QuranPrefs.set failed for " + key + ": " + e);
            return false;
        }
    }
};
