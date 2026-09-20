// Just Type support: puts the list of surahs into the device database so the
// webOS "Just Type" search (start typing in the launcher or a card) can find them.
//
// Each surah becomes one record. appinfo.json ("universalSearch") tells Just Type
// which kind to search and how to show the results; when the user taps a result,
// the app is launched with {surah: <number>} (see QuranApp.openFromParams).
//
// The database kind name below MUST match "dbQuery.from" in appinfo.json, and the
// kind's owner must be this app's id.
//
// The user also has to switch the app on in Settings > Just Type; an app cannot
// do that for them.

enyo.kind({
    name: "QuranJustType",
    kind: enyo.Component,

    // Bump this when the searchable text changes, so existing installs re-save it.
    dataVersion: 3,

    components: [
        {name: "putKind", kind: "PalmService", service: "palm://com.palm.db/", method: "putKind",
            onSuccess: "kindReady", onFailure: "failed"},
        {name: "putPermissions", kind: "PalmService", service: "palm://com.palm.db/", method: "putPermissions",
            onSuccess: "permissionsReady", onFailure: "failed"},
        {name: "find", kind: "PalmService", service: "palm://com.palm.db/", method: "find",
            onSuccess: "foundRecords", onFailure: "failed"},
        {name: "del", kind: "PalmService", service: "palm://com.palm.db/", method: "del",
            onSuccess: "deleted", onFailure: "failed"},
        {name: "put", kind: "PalmService", service: "palm://com.palm.db/", method: "put",
            onSuccess: "saved", onFailure: "failed"}
    ],

    create: function () {
        this.inherited(arguments);
        this.appId = (enyo.fetchAppId && enyo.fetchAppId()) || "com.magq.quranreader";
        this.kindId = this.appId + ".surah:1";
    },

    // Call once, a moment after the app has started. Safe to call on every launch:
    // it only rewrites the records when they are missing or out of date.
    setup: function () {
        this.$.putKind.call({
            id: this.kindId,
            owner: this.appId,
            indexes: [{
                name: "search",
                props: [{name: "search", type: "single", tokenize: "all", collate: "primary"}]
            }]
        });
    },

    kindReady: function (inSender, inResponse) {
        if (inResponse && inResponse.returnValue === false) { return this.failed(inSender, inResponse); }
        // Let the launcher (which runs Just Type) read our records.
        this.$.putPermissions.call({
            permissions: [{
                type: "db.kind",
                object: this.kindId,
                caller: "com.palm.launcher",
                operations: {read: "allow"}
            }]
        });
    },

    permissionsReady: function (inSender, inResponse) {
        if (inResponse && inResponse.returnValue === false) { return this.failed(inSender, inResponse); }
        this.$.find.call({query: {from: this.kindId, limit: 1}});
    },

    foundRecords: function (inSender, inResponse) {
        var have = inResponse && inResponse.results && inResponse.results.length > 0;
        var current = QuranPrefs.get("justTypeVersion", 0) === this.dataVersion;
        if (have && current) { return; }   // nothing to do
        // Start clean so nothing is listed twice, then save everything again.
        this.$.del.call({query: {from: this.kindId}});
    },

    deleted: function (inSender, inResponse) {
        var self = this;
        QuranData.loadJson("data/surahs.json", true, function (err, surahs) {
            if (err) {
                enyo.error("Just Type: could not read the surah list: " + err);
                return;
            }
            self.$.put.call({objects: self.buildRecords(surahs)});
        });
    },

    saved: function (inSender, inResponse) {
        if (inResponse && inResponse.returnValue === false) { return this.failed(inSender, inResponse); }
        QuranPrefs.set("justTypeVersion", this.dataVersion);
        enyo.log("Just Type: saved the surah list");
    },

    failed: function (inSender, inError) {
        // Just Type is a nice extra. A problem here must never affect the app itself.
        enyo.error("Just Type setup failed: " + enyo.json.stringify(inError));
    },

    // ---- building the records ----

    // Removes vowel marks and the small Quranic signs, and turns alef-wasla into a
    // plain alef, so typing "البقرة" finds "ٱلْبَقَرَةِ".
    plainArabic: function (s) {
        return String(s || "")
            .replace(/[ً-ٰٟۖ-ۭ]/g, "")
            .replace(/ٱ/g, "ا");
    },

    buildRecords: function (surahs) {
        var self = this;
        return surahs.map(function (s) {
            var words = [
                String(s.n),
                s.en,
                s.en.replace(/[^A-Za-z0-9]/g, ""),   // "Al-Baqara" -> "AlBaqara" (typed without the hyphen)
                s.tr,
                self.plainArabic(s.ar),
                "surah"
            ];
            return {
                _kind: self.kindId,
                n: s.n,
                // Just Type only fetches the fields listed in appinfo.json "displayFields",
                // and draws only the first three. "id" is listed 4th so it is fetched and
                // handed to the app on launch without being drawn; "blank" fills slot 3.
                id: String(s.n),
                blank: "",
                display: s.en + " – " + s.tr,
                secondary: "Surah " + s.n + " · " + s.type + " · " + s.count + " verses",
                search: words.join(" ")
            };
        });
    }
});
