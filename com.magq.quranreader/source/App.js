// The app itself: two screens (home and reader) plus the top drop-down menu
// where the user picks the Arabic script and the English translation.

// Builds one tick-box menu item per available source. The item remembers
// which source it stands for in `sourceId`. Enyo builds menus lazily, so the tick
// for the saved choice is set here, when the item is defined, not later.
var QuranMenuItems = function (prefix, list, handler, prefKey) {
    var selected = QuranSources.find(list, QuranPrefs.get(prefKey, null)).id;
    return list.map(function (src) {
        return {
            name: prefix + src.id,
            kind: "MenuCheckItem",
            caption: src.label,
            sourceId: src.id,
            checked: src.id === selected,
            onclick: handler
        };
    });
};

enyo.kind({
    name: "QuranApp",
    kind: enyo.VFlexBox,

    components: [
        // Just Type (and a second launch while the app is running) send {surah: N}.
        {kind: "ApplicationEvents", onBack: "showHome",
            onWindowParamsChange: "launchParamsChanged", onApplicationRelaunch: "launchParamsChanged"},
        {name: "justType", kind: "QuranJustType"},
        {name: "openLink", kind: "PalmService", service: "palm://com.palm.applicationManager/", method: "open",
            onFailure: "linkFailed"},
        {kind: "AppMenu", components: [
            {caption: "Arabic script", components: QuranMenuItems("script_", QuranSources.scripts, "pickScript", "script")},
            {caption: "Translation", components: QuranMenuItems("translation_", QuranSources.translations, "pickTranslation", "translation")},
            {caption: "Verse numbers", components: QuranMenuItems("numbers_", QuranSources.numberStyles, "pickNumbers", "numbers")},
            {caption: "About", onclick: "showAbout"}
        ]},
        {name: "pane", kind: "Pane", flex: 1, components: [
            {name: "home", kind: "QuranHome", onOpenSurah: "openSurah"},
            {name: "reader", kind: "QuranReader", onBack: "showHome", onProgress: "saveProgress"}
        ]},
        {name: "fontDialog", kind: "ModalDialog", caption: "One more step", components: [
            {allowHtml: true, style: "padding: 8px 0;", content:
                "The Arabic font is not active yet, so Arabic text shows as empty boxes.<br><br>" +
                "Please perform a <b>full restart</b> or a <b>Luna restart</b>.<br><br>" +
                "This only happens after installing or updating the app."},
            {kind: "Button", caption: "OK", onclick: "closeFontDialog"}
        ]},
        {name: "about", kind: "ModalDialog", className: "q-about", caption: "About Quran Reader", components: [
            // Links are plain <a> tags carrying their address in data-url; aboutClick opens
            // them in the browser (a normal link would navigate the app away).
            {allowHtml: true, style: "padding: 8px 0;", onclick: "aboutClick", content:
                "All praise is due to Allah, the most high.<br><br>" +
                "Arabic text: <a href=\"#\" class=\"q-link\" data-url=\"http://tanzil.net\">Tanzil Project (tanzil.net)</a>, " +
                "Uthmani script. Copyright (C) 2007-2021 Tanzil Project, " +
                "<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by/3.0/\">Creative Commons Attribution 3.0</a>. " +
                "The text is unchanged.<br><br>" +
                "English translations: <a href=\"#\" class=\"q-link\" data-url=\"https://www.clearquran.com\">Translation by Talal Itani, ClearQuran.com</a> " +
                "(<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by-nd/4.0/\">CC BY-ND 4.0</a>), and " +
                "The Meaning of the Glorious Koran by Marmaduke Pickthall (public domain).<br><br>" +
                "Arabic font: Amiri Quran, modified as \"Quran Shaped\" (SIL Open Font License 1.1).<br><br>" +
                "This app is free and non-commercial.<br><br>" +
                "Any errors in the displaying of the Quran were done purely by accident. " +
                "Contact MAGQ on the webOS Archive server if there are any. " +
                "May Allah forgive those mistakes."},
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

    // After the first draw, check that the Arabic font is really usable. A new font
    // is only picked up after a restart, so right after an install it may not be.
    rendered: function () {
        this.inherited(arguments);
        var self = this;
        this.openFromParams(enyo.windowParams);   // started from Just Type
        setTimeout(function () {
            if (!QuranFont.isLoaded()) { self.$.fontDialog.openAtCenter(); }
        }, 800);
        // Keep the Just Type surah list up to date, after the app has settled.
        setTimeout(function () { self.$.justType.setup(); }, 3000);
    },

    launchParamsChanged: function (inSender, inEvent) {
        this.openFromParams((inEvent && inEvent.params) || enyo.windowParams);
    },

    // Opens the surah named in launch parameters like {surah: "2"}; ignores anything else.
    openFromParams: function (params) {
        if (!params || params.surah === undefined) { return; }
        var text = String(params.surah);
        try { text = decodeURIComponent(text); } catch (e) { /* use it as it is */ }
        var n = parseInt(text, 10);
        if (n >= 1 && n <= 114) { this.openSurah(this, n, 1); }
    },

    closeFontDialog: function () {
        this.$.fontDialog.close();
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

    // Opens a link tapped in the About text in the browser.
    aboutClick: function (inSender, inEvent) {
        var node = inEvent && inEvent.target;
        var url = node && node.getAttribute ? node.getAttribute("data-url") : null;
        if (url) {
            if (inEvent.preventDefault) { inEvent.preventDefault(); }
            this.$.openLink.call({target: url});
        }
    },

    linkFailed: function (inSender, inError) {
        enyo.error("Could not open the browser: " + enyo.json.stringify(inError));
    },

    closeAbout: function () {
        this.$.about.close();
    }
});
