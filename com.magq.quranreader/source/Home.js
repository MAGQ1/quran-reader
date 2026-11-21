// Home screen: browse and search surahs or juz, see bookmarks, and resume where
// you left off.

// One list on the home screen. Each tab (Surahs, Juz, Bookmarks) has its own, so
// each keeps its own scroll position when you switch away and back; a single shared
// list kept one position for all three, and a surah list scrolled down to row 62
// showed the 30 juz as a blank page. Declared as a kind so the three lists' row
// controls (num, title, ...) have separate names.
enyo.kind({
    name: "QuranHomeList",
    kind: enyo.VirtualList,
    flex: 1,
    events: {
        onRowTap: ""      // (inEvent): inEvent.rowIndex is the row
    },
    components: [
        {name: "row", kind: "Item", className: "q-row", layoutKind: "HFlexLayout", onclick: "rowClick", components: [
            {name: "num", className: "q-num"},
            {kind: "VFlexBox", flex: 1, components: [
                {name: "title"},
                {name: "sub", className: "q-sub"}
            ]},
            {name: "arabic", className: "q-arabic"},
            // Only shown on the Bookmarks list; rowTap checks for its class. The row
            // stretches its children to full height, so the button sits in a box
            // that centres it vertically at its own size.
            {name: "removeBox", kind: "VFlexBox", pack: "center", components: [
                {kind: "Button", className: "enyo-button-negative q-remove", caption: "Remove"}
            ]}
        ]}
    ],
    rowClick: function (inSender, inEvent) {
        this.doRowTap(inEvent);
    }
});

enyo.kind({
    name: "QuranHome",
    kind: enyo.VFlexBox,

    events: {
        onOpenSurah: ""   // (surahNumber, ayahNumber)
    },

    published: {
        resume: null      // {surah, ayah} of the last reading position
    },

    components: [
        {kind: "PageHeader", content: "Quran Reader"},
        // align: "center" stops the row from stretching the buttons to the height of
        // the search box (which made them tall with the text stuck at the top).
        {kind: "HFlexBox", className: "q-controls", align: "center", components: [
            {name: "modeGroup", kind: "RadioGroup", className: "q-mode", onChange: "modeChange", components: [
                {caption: "Surahs"},
                {caption: "Juz"},
                {caption: "Bookmarks"}
            ]},
            {name: "searchBox", kind: "InputBox", flex: 1, style: "margin-left: 12px;", components: [
                {name: "search", kind: "Input", flex: 1, hint: "Search surahs", changeOnInput: true, onchange: "searchChange"}
            ]}
        ]},
        {name: "resumeButton", kind: "Button", className: "enyo-button-blue", showing: false, onclick: "resumeTap"},
        {name: "noBookmarks", className: "q-status", showing: false, allowHtml: true, content:
            "No bookmarks yet.<br>Tap the ribbon beside a verse to bookmark it."},
        // Hidden lists are kept, not emptied, so each keeps its place (see QuranHomeList).
        {name: "surahList", kind: "QuranHomeList", flex: 1, onSetupRow: "setupRow", onRowTap: "rowTap"},
        {name: "juzList", kind: "QuranHomeList", flex: 1, showing: false, onSetupRow: "setupRow", onRowTap: "rowTap"},
        {name: "bookmarkList", kind: "QuranHomeList", flex: 1, showing: false, onSetupRow: "setupRow", onRowTap: "rowTap"}
    ],

    create: function () {
        this.inherited(arguments);
        this.mode = "surah";   // "surah", "juz" or "bookmarks"
        this.surahs = [];
        this.shapedNames = [];
        this.juz = [];
        this.items = {surah: [], juz: [], bookmarks: []};   // what each list shows
        this.loadIndex();
    },

    loadIndex: function () {
        var self = this;
        QuranData.loadMany([
            {url: "data/surahs.json", cache: true},
            {url: "data/juz.json", cache: true},
            {url: QuranSources.scripts[0].shapedExtra, cache: true}
        ], function (err, results) {
            if (err) {
                enyo.error("Could not load the surah index: " + err);
                self.$.resumeButton.setCaption("Could not load the Quran data. Try reinstalling the app.");
                self.$.resumeButton.setShowing(true);
                return;
            }
            self.surahs = results[0];
            self.juz = results[1];
            self.shapedNames = results[2].names;   // Arabic names, pre-joined for display
            self.updateItems("surah");
            self.updateItems("juz");
            self.updateItems("bookmarks");
            self.updateResume();
        });
    },

    // ---- list contents ----

    // Lowercase and drop punctuation so "Al-Baqara", "al baqara" and
    // "albaqara" all match each other.
    normalize: function (s) {
        return String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");
    },

    listFor: function (mode) {
        return mode === "juz" ? this.$.juzList : mode === "bookmarks" ? this.$.bookmarkList : this.$.surahList;
    },

    modeOf: function (list) {
        return list === this.$.juzList ? "juz" : list === this.$.bookmarkList ? "bookmarks" : "surah";
    },

    // Refills one tab's list. fromTop: start it at its first row (a new search);
    // otherwise it keeps its scroll position (bookmarks added or removed).
    updateItems: function (mode, fromTop) {
        var list = this.listFor(mode);
        if (mode === "juz") {
            this.items.juz = this.juz;
        } else if (mode === "bookmarks") {
            var surahs = this.surahs;
            this.items.bookmarks = QuranBookmarks.all().filter(function (b) { return !!surahs[b.surah - 1]; });
        } else {
            var q = this.normalize(this.$.search.getValue() || "");
            var self = this;
            this.items.surah = this.surahs.filter(function (s) {
                if (q === "") { return true; }
                return String(s.n) === q ||
                    self.normalize(s.en).indexOf(q) !== -1 ||
                    self.normalize(s.tr).indexOf(q) !== -1 ||
                    self.normalize(s.ar).indexOf(q) !== -1;
            });
        }
        if (mode === this.mode) { this.updateNoBookmarks(); }
        if (fromTop) {
            list.punt();
        } else {
            list.reset();
        }
    },

    updateNoBookmarks: function () {
        this.$.noBookmarks.setShowing(this.mode === "bookmarks" && this.items.bookmarks.length === 0);
    },

    // Called when the home screen comes back into view: bookmarks may have changed
    // in the reader.
    refreshBookmarks: function () {
        this.updateItems("bookmarks");
    },

    setupRow: function (inSender, inIndex) {
        var mode = this.modeOf(inSender), items = this.items[mode];
        if (inIndex < 0 || inIndex >= items.length) { return false; }
        var it = items[inIndex], r = inSender.$;
        r.removeBox.setShowing(mode === "bookmarks");
        if (mode === "bookmarks") {
            var s = this.surahs[it.surah - 1];
            r.num.setContent(it.surah);
            r.title.setContent(s.en + " " + it.surah + ":" + it.ayah);
            r.sub.setContent(s.tr + " · verse " + it.ayah + " of " + s.count);
            r.arabic.setContent(this.shapedNames[it.surah - 1] || "");
        } else if (mode === "juz") {
            var start = this.surahs[it.surah - 1];
            r.num.setContent(it.juz);
            r.title.setContent("Juz " + it.juz);
            r.sub.setContent("Starts at " + start.en + " " + it.surah + ":" + it.ayah);
            r.arabic.setContent("");
        } else {
            r.num.setContent(it.n);
            r.title.setContent(it.en + " – " + it.tr);
            r.sub.setContent(it.type + " · " + it.count + " verses");
            r.arabic.setContent(this.shapedNames[it.n - 1] || "");
        }
        return true;
    },

    // ---- user actions ----

    modeChange: function (inSender) {
        this.mode = ["surah", "juz", "bookmarks"][inSender.getValue()] || "surah";
        // Hide it without removing it, so the row keeps its height and the buttons
        // beside it do not jump when switching between the tabs.
        this.$.searchBox.applyStyle("visibility", this.mode === "surah" ? "visible" : "hidden");
        var modes = ["surah", "juz", "bookmarks"];
        for (var i = 0; i < modes.length; i++) {
            this.listFor(modes[i]).setShowing(modes[i] === this.mode);
        }
        this.updateNoBookmarks();
        // A list measured its height while hidden (as 0); let it measure again. This
        // redraws the visible rows and keeps the scroll position.
        this.listFor(this.mode).resized();
    },

    searchChange: function () {
        this.updateItems("surah", true);
    },

    rowTap: function (inSender, inEvent) {
        var mode = this.modeOf(inSender);
        var it = this.items[mode][inEvent.rowIndex];
        if (!it) { return; }
        if (mode === "bookmarks") {
            if (this.tappedRemove(inEvent.target)) {
                QuranBookmarks.remove(it.surah, it.ayah);
                this.updateItems("bookmarks");
            } else {
                this.doOpenSurah(it.surah, it.ayah);
            }
        } else if (mode === "juz") {
            this.doOpenSurah(it.surah, it.ayah);
        } else {
            this.doOpenSurah(it.n, 1);
        }
    },

    // True if the tap landed on a row's Remove button. The tap can land on an element
    // inside the button, so look a few levels up for its q-remove class.
    tappedRemove: function (el) {
        for (var i = 0; el && i < 4; i++, el = el.parentNode) {
            if ((" " + el.className + " ").indexOf(" q-remove ") !== -1) { return true; }
        }
        return false;
    },

    // ---- "Continue reading" button ----

    resumeChanged: function () {
        this.updateResume();
    },

    updateResume: function () {
        var r = this.resume;
        if (!r || !this.surahs.length || !this.surahs[r.surah - 1]) {
            this.$.resumeButton.setShowing(false);
            return;
        }
        this.$.resumeButton.setCaption("Continue reading: " + this.surahs[r.surah - 1].en + " " + r.surah + ":" + r.ayah);
        this.$.resumeButton.setShowing(true);
    },

    resumeTap: function () {
        if (this.resume) { this.doOpenSurah(this.resume.surah, this.resume.ayah); }
    }
});
