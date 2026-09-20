// The app itself: two screens (home and reader) plus the top drop-down menu
// where the user picks the Arabic script and the English translation.

// Builds one tick-box menu item per available source. The item remembers
// which source it stands for in `sourceId`.
var QuranMenuItems = function (prefix, list, handler) {
    return list.map(function (src) {
        return {
            name: prefix + src.id,
            kind: "MenuCheckItem",
            caption: src.label,
            sourceId: src.id,
            onclick: handler
        };
    });
};

enyo.kind({
    name: "QuranApp",
    kind: enyo.VFlexBox,

    components: [
        {kind: "ApplicationEvents", onBack: "showHome"},
        {kind: "AppMenu", components: [
            {caption: "Arabic script", components: QuranMenuItems("script_", QuranSources.scripts, "pickScript")},
            {caption: "Translation", components: QuranMenuItems("translation_", QuranSources.translations, "pickTranslation")},
            {caption: "Verse numbers", components: QuranMenuItems("numbers_", QuranSources.numberStyles, "pickNumbers")},
            {caption: "About", onclick: "showAbout"}
        ]},
        {name: "pane", kind: "Pane", flex: 1, components: [
            {name: "home", kind: "QuranHome", onOpenSurah: "openSurah"},
            {name: "reader", kind: "QuranReader", onBack: "showHome", onProgress: "saveProgress"}
        ]},
        {name: "about", kind: "ModalDialog", caption: "About Quran Reader", components: [
            {allowHtml: true, style: "padding: 8px 0;", content:
                "Arabic text: Tanzil Project (tanzil.net), Uthmani script.<br>" +
                "English translation: Saheeh International.<br>" +
                "Arabic font: Amiri Quran, modified as \"Quran Shaped\" (SIL Open Font License 1.1)."},
            {kind: "Button", caption: "Close", onclick: "closeAbout"}
        ]}
    ],

    create: function () {
        this.inherited(arguments);
        // Saved choices; an unknown or missing value falls back to the first option.
        this.script = QuranSources.find(QuranSources.scripts, QuranPrefs.get("script", null));
        this.translation = QuranSources.find(QuranSources.translations, QuranPrefs.get("translation", null));
        this.numbers = QuranSources.find(QuranSources.numberStyles, QuranPrefs.get("numbers", null));
        this.position = QuranPrefs.get("position", null);
        if (this.position && !(this.position.surah >= 1 && this.position.surah <= 114 && this.position.ayah >= 1)) {
            this.position = null;
        }

        this.$.reader.setSources(this.script, this.translation, this.numbers);
        this.$.home.setResume(this.position);
        this.updateMenuChecks();
    },

    // ---- navigation ----

    openSurah: function (inSender, surah, ayah) {
        this.$.reader.open(surah, ayah);
        this.$.pane.selectView(this.$.reader);
    },

    showHome: function () {
        this.$.pane.selectView(this.$.home);
    },

    saveProgress: function (inSender, surah, ayah) {
        this.position = {surah: surah, ayah: ayah};
        QuranPrefs.set("position", this.position);
        this.$.home.setResume(this.position);
    },

    // ---- menu ----

    pickScript: function (inSender) {
        this.script = QuranSources.find(QuranSources.scripts, inSender.sourceId);
        QuranPrefs.set("script", this.script.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers);
    },

    pickTranslation: function (inSender) {
        this.translation = QuranSources.find(QuranSources.translations, inSender.sourceId);
        QuranPrefs.set("translation", this.translation.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers);
    },

    pickNumbers: function (inSender) {
        this.numbers = QuranSources.find(QuranSources.numberStyles, inSender.sourceId);
        QuranPrefs.set("numbers", this.numbers.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers);
    },

    // Ticks the current choice in each submenu and unticks the others.
    updateMenuChecks: function () {
        var self = this;
        QuranSources.scripts.forEach(function (s) {
            var item = self.$["script_" + s.id];
            if (item) { item.setChecked(s.id === self.script.id); }
        });
        QuranSources.translations.forEach(function (t) {
            var item = self.$["translation_" + t.id];
            if (item) { item.setChecked(t.id === self.translation.id); }
        });
        QuranSources.numberStyles.forEach(function (n) {
            var item = self.$["numbers_" + n.id];
            if (item) { item.setChecked(n.id === self.numbers.id); }
        });
    },

    showAbout: function () {
        this.$.about.openAtCenter();
    },

    closeAbout: function () {
        this.$.about.close();
    }
});
