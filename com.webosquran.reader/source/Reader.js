// Reader screen: shows one surah, Arabic and translation side by side per
// verse, and reports the verse at the top of the screen so progress is saved.

enyo.kind({
    name: "QuranReader",
    kind: enyo.VFlexBox,

    events: {
        onBack: "",
        onProgress: ""    // (surahNumber, ayahNumber)
    },

    components: [
        {kind: "Toolbar", components: [
            {kind: "Button", caption: "Back", onclick: "doBack"},
            {name: "title", flex: 1, className: "q-title"},
            {name: "prevButton", kind: "Button", caption: "Previous", onclick: "prevTap"},
            {name: "nextButton", kind: "Button", caption: "Next", onclick: "nextTap"}
        ]},
        {name: "scroller", kind: "Scroller", flex: 1, onScrollStop: "scrollStopped", components: [
            {name: "body", className: "reader-body", allowHtml: true}
        ]}
    ],

    create: function () {
        this.inherited(arguments);
        this.surah = 0;       // surah currently shown (0 = none yet)
        this.topAyah = 1;     // verse at the top of the screen
        this.textShown = false;   // true once the text is on screen
        this.token = 0;       // lets us ignore out-of-date loads
        this.script = QuranSources.scripts[0];
        this.translation = QuranSources.translations[0];
        this.numbers = QuranSources.numberStyles[0];
    },

    // Called by the app when the user picks another script, translation or
    // number style. Redraws the current surah and keeps the reader at the same verse.
    setSources: function (script, translation, numbers) {
        this.script = script;
        this.translation = translation;
        this.numbers = numbers || QuranSources.numberStyles[0];
        if (this.surah) { this.load(this.surah, this.topAyah); }
    },

    open: function (surah, ayah) {
        this.load(surah, ayah || 1);
    },

    // ---- loading and drawing ----

    load: function (surah, ayah) {
        var self = this;
        var token = ++this.token;
        var file = QuranData.pad3(surah) + ".json";

        this.surah = surah;
        this.topAyah = ayah;
        this.textShown = false;
        this.$.prevButton.setDisabled(surah <= 1);
        this.$.nextButton.setDisabled(surah >= 114);
        this.$.body.setContent('<div class="q-status">Loading…</div>');
        this.$.scroller.setScrollTop(0);

        QuranData.loadMany([
            {url: "data/surahs.json", cache: true},
            {url: this.script.shapedExtra, cache: true},
            {url: this.script.shapedFolder + "/" + file, cache: false},
            {url: this.translation.folder + "/" + file, cache: false}
        ], function (err, results) {
            if (token !== self.token) { return; }   // user moved on; ignore
            if (err) {
                enyo.error("Could not load surah " + surah + ": " + err);
                self.$.body.setContent('<div class="q-status">This surah could not be loaded.</div>');
                return;
            }
            self.draw(results[0][surah - 1], results[1].bismillah, results[2], results[3], ayah);
        });
    },

    escapeHtml: function (s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    },

    arabicDigits: function (n) {
        var digits = "٠١٢٣٤٥٦٧٨٩";
        return String(n).replace(/[0-9]/g, function (d) { return digits.charAt(d); });
    },

    draw: function (meta, bismillah, arabic, english, ayah) {
        var self = this;
        var font = this.script.fontFamily ? ' style="font-family:' + this.escapeHtml(this.script.fontFamily) + '"' : "";
        var html = [];

        this.$.title.setContent(meta.n + ". " + meta.en + " – " + meta.tr);
        if (meta.bismillah) {
            html.push('<div class="q-bismillah"' + font + '>' + this.escapeHtml(bismillah) + '</div>');
        }
        arabic.forEach(function (text, i) {
            var n = i + 1;
            html.push(
                '<div class="q-ayah" id="ayah-' + n + '">' +
                '<div class="q-ar"' + font + '>' + self.escapeHtml(text) +
                ' <span class="q-ar-num">﴿' + (self.numbers.id === "regular" ? n : self.arabicDigits(n)) + '﴾</span></div>' +
                '<div class="q-en"><span class="q-en-num">' + n + '.</span> ' + self.escapeHtml(english[i] || "") + '</div>' +
                '</div>'
            );
        });
        this.$.body.setContent(html.join(""));

        // Give the browser a moment to lay the text out before scrolling.
        var token = this.token;
        setTimeout(function () {
            if (token !== self.token) { return; }
            self.scrollToAyah(ayah);
            self.textShown = true;
            self.doProgress(self.surah, ayah);
        }, 100);
    },

    scrollToAyah: function (n) {
        var node = this.$.body.hasNode();
        var el = node && node.querySelector("#ayah-" + n);
        this.$.scroller.setScrollTop(el ? el.offsetTop : 0);
    },

    // ---- progress ----

    // Finds the first verse that is still (at least partly) on screen.
    scrollStopped: function () {
        if (!this.textShown) { return; }
        var node = this.$.body.hasNode();
        if (!node) { return; }
        var top = this.$.scroller.getScrollTop();
        var verses = node.querySelectorAll(".q-ayah");
        for (var i = 0; i < verses.length; i++) {
            if (verses[i].offsetTop + verses[i].offsetHeight > top + 1) {
                this.topAyah = i + 1;
                this.doProgress(this.surah, this.topAyah);
                return;
            }
        }
    },

    // ---- previous / next surah ----

    prevTap: function () {
        if (this.surah > 1) { this.open(this.surah - 1, 1); }
    },

    nextTap: function () {
        if (this.surah < 114) { this.open(this.surah + 1, 1); }
    }
});
