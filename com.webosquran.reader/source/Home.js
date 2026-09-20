// Home screen: browse and search surahs or juz, and resume where you left off.

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
        {kind: "HFlexBox", className: "q-controls", components: [
            {name: "modeGroup", kind: "RadioGroup", onChange: "modeChange", components: [
                {caption: "Surahs"},
                {caption: "Juz"}
            ]},
            {kind: "InputBox", flex: 1, style: "margin-left: 12px;", components: [
                {name: "search", kind: "Input", flex: 1, hint: "Search surahs", changeOnInput: true, onchange: "searchChange"}
            ]}
        ]},
        {name: "resumeButton", kind: "Button", className: "enyo-button-blue", showing: false, onclick: "resumeTap"},
        {name: "list", kind: "VirtualList", flex: 1, onSetupRow: "setupRow", components: [
            {name: "row", kind: "Item", className: "q-row", layoutKind: "HFlexLayout", onclick: "rowTap", components: [
                {name: "num", className: "q-num"},
                {kind: "VFlexBox", flex: 1, components: [
                    {name: "title"},
                    {name: "sub", className: "q-sub"}
                ]},
                {name: "arabic", className: "q-arabic"}
            ]}
        ]}
    ],

    create: function () {
        this.inherited(arguments);
        this.mode = "surah";   // "surah" or "juz"
        this.surahs = [];
        this.shapedNames = [];
        this.juz = [];
        this.items = [];       // what the list currently shows
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
            self.updateItems();
            self.updateResume();
        });
    },

    // ---- list contents ----

    // Lowercase and drop punctuation so "Al-Baqara", "al baqara" and
    // "albaqara" all match each other.
    normalize: function (s) {
        return String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");
    },

    updateItems: function () {
        if (this.mode === "juz") {
            this.items = this.juz;
        } else {
            var q = this.normalize(this.$.search.getValue() || "");
            var self = this;
            this.items = this.surahs.filter(function (s) {
                if (q === "") { return true; }
                return String(s.n) === q ||
                    self.normalize(s.en).indexOf(q) !== -1 ||
                    self.normalize(s.tr).indexOf(q) !== -1 ||
                    self.normalize(s.ar).indexOf(q) !== -1;
            });
        }
        this.$.list.reset();
    },

    setupRow: function (inSender, inIndex) {
        if (inIndex < 0 || inIndex >= this.items.length) { return false; }
        var it = this.items[inIndex];
        if (this.mode === "juz") {
            var start = this.surahs[it.surah - 1];
            this.$.num.setContent(it.juz);
            this.$.title.setContent("Juz " + it.juz);
            this.$.sub.setContent("Starts at " + start.en + " " + it.surah + ":" + it.ayah);
            this.$.arabic.setContent("");
        } else {
            this.$.num.setContent(it.n);
            this.$.title.setContent(it.en + " – " + it.tr);
            this.$.sub.setContent(it.type + " · " + it.count + " verses");
            this.$.arabic.setContent(this.shapedNames[it.n - 1] || "");
        }
        return true;
    },

    // ---- user actions ----

    modeChange: function (inSender) {
        this.mode = (inSender.getValue() === 1) ? "juz" : "surah";
        this.$.search.setShowing(this.mode === "surah");
        this.updateItems();
    },

    searchChange: function () {
        this.updateItems();
    },

    rowTap: function (inSender, inEvent) {
        var it = this.items[inEvent.rowIndex];
        if (!it) { return; }
        if (this.mode === "juz") {
            this.doOpenSurah(it.surah, it.ayah);
        } else {
            this.doOpenSurah(it.n, 1);
        }
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
