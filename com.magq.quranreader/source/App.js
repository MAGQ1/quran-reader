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
        // Update check (App Museum II). It shows its own "Update Now / Later" box when an update exists.
        {name: "updater", kind: "Helpers.Updater", onNoUpdate: "updateNone", onCheckFailed: "updateFailed",
            onInstallFailed: "updateInstallFailed"},
        {name: "openLink", kind: "PalmService", service: "palm://com.palm.applicationManager/", method: "open",
            onFailure: "linkFailed"},
        {kind: "AppMenu", components: [
            {caption: "Arabic script", components: QuranMenuItems("script_", QuranSources.scripts, "pickScript", "script")},
            {caption: "Translation", components: QuranMenuItems("translation_", QuranSources.translations, "pickTranslation", "translation")},
            {caption: "Verse numbers", components: QuranMenuItems("numbers_", QuranSources.numberStyles, "pickNumbers", "numbers")},
            {caption: "Theme", components: QuranMenuItems("theme_", QuranSources.themes, "pickTheme", "theme")},
            {caption: "Check for updates", onclick: "checkUpdatesTap"},
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
        // lazy: false builds the dialog at start-up. (Enyo normally builds a dialog when it is first
        // opened, so its text controls do not exist yet when the code sets their content.)
        {name: "message", kind: "ModalDialog", lazy: false, caption: "", components: [
            {name: "messageText", allowHtml: true, style: "padding: 8px 0;"},
            {kind: "Button", caption: "OK", onclick: "closeMessage"}
        ]},
        {name: "about", kind: "ModalDialog", lazy: false, className: "q-about", caption: "About Quran Reader", components: [
            // Links are plain <a> tags carrying their address in data-url; aboutClick opens
            // them in the browser (a normal link would navigate the app away).
            {allowHtml: true, style: "padding: 8px 0;", onclick: "aboutClick", content:
                "All praise is due to Allah, the Most High.<br><br>" +
                "Arabic text: <a href=\"#\" class=\"q-link\" data-url=\"http://tanzil.net\">Tanzil Project (tanzil.net)</a>, " +
                "Uthmani script. Copyright (C) 2007-2021 Tanzil Project, " +
                "<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by/3.0/\">Creative Commons Attribution 3.0</a>. " +
                "The text is unchanged.<br><br>" +
                "English translations: <a href=\"#\" class=\"q-link\" data-url=\"https://www.clearquran.com\">Translation by Talal Itani, ClearQuran.com</a> " +
                "(<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by-nd/4.0/\">CC BY-ND 4.0</a>), and " +
                "The Meaning of the Glorious Koran by Marmaduke Pickthall (public domain).<br><br>" +
                "Arabic font: Amiri Quran, modified as \"Quran Shaped\" (SIL Open Font License 1.1).<br><br>" +
                "This app is free and non-commercial.<br><br>" +
                "Update check: the app asks appcatalog.webosarchive.org whether a newer version exists. " +
                "It sends the app version, your device model and webOS version, and a random ID made by this app " +
                "(no serial number).<br><br>" +
                "Any errors in the displaying of the Quran were done purely by accident. " +
                "Contact MAGQ on the webOS Archive server if there are any. " +
                "May Allah forgive those mistakes."},
            {name: "aboutVersion", style: "padding: 4px 0 8px 0; color: #666;"},
            {kind: "Button", caption: "Close", onclick: "closeAbout"}
        ]}
    ],

    create: function () {
        this.inherited(arguments);
        // Saved choices; an unknown or missing value falls back to the first option.
        this.script = QuranSources.find(QuranSources.scripts, QuranPrefs.get("script", null));
        this.translation = QuranSources.find(QuranSources.translations, QuranPrefs.get("translation", null));
        this.numbers = QuranSources.find(QuranSources.numberStyles, QuranPrefs.get("numbers", null));
        this.theme = QuranSources.find(QuranSources.themes, QuranPrefs.get("theme", null));
        this.position = QuranPrefs.get("position", null);
        if (this.position && !(this.position.surah >= 1 && this.position.surah <= 114 && this.position.ayah >= 1)) {
            this.position = null;
        }

        this.$.reader.setSources(this.script, this.translation, this.numbers);
        this.$.home.setResume(this.position);
        this.updateMenuChecks();
        this.applyTheme();
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
        // Look for a newer version shortly after start (quietly; only speaks up if there is one).
        setTimeout(function () { self.autoCheckForUpdate(); }, 6000);
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

    pickTheme: function (inSender) {
        this.theme = QuranSources.find(QuranSources.themes, inSender.sourceId);
        QuranPrefs.set("theme", this.theme.id);
        this.updateMenuChecks();
        this.applyTheme();
    },

    // Toggled on <body>, not on this kind's own root: Enyo's popups (the top menu,
    // the About/restart dialogs) render into a separate layer that is only a
    // descendant of <body>, not of this app's own DOM node. Their own chrome (the
    // Onyx dialog border image) is a fixed light-coloured graphic either way; only
    // our own content (Home, Reader) actually changes look with the class.
    applyTheme: function () {
        var dark = this.theme.id === "dark";
        var name = "q-dark";
        var body = document.body;
        var has = (" " + body.className + " ").indexOf(" " + name + " ") !== -1;
        if (dark && !has) { body.className += " " + name; }
        if (!dark && has) { body.className = (" " + body.className + " ").replace(" " + name + " ", " ").replace(/^\s+|\s+$/g, ""); }
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
        QuranSources.themes.forEach(function (t) {
            var item = self.$["theme_" + t.id];
            if (item) { item.setChecked(t.id === self.theme.id); }
        });
    },

    showAbout: function () {
        this.$.aboutVersion.setContent("Version " + this.appVersion());
        this.$.about.openAtCenter();
    },

    // ---- updates ----

    // The name this app has in App Museum II. The update check only works if it matches
    // the listing exactly (spelling, capitals, spaces).
    museumName: "Quran Reader",

    appVersion: function () {
        try { return enyo.fetchAppInfo().version; } catch (e) { return "?"; }
    },

    // Automatic check on start: at most twice a day, and silent unless an update exists.
    autoCheckForUpdate: function () {
        var last = QuranPrefs.get("lastUpdateCheck", 0);
        var now = new Date().getTime();
        if (now >= last && now - last < 12 * 60 * 60 * 1000) { return; }
        QuranPrefs.set("lastUpdateCheck", now);
        this.manualCheck = false;
        this.$.updater.CheckForUpdate(encodeURIComponent(this.museumName));
    },

    // The menu item: always checks, and always says what happened.
    checkUpdatesTap: function () {
        this.manualCheck = true;
        this.$.updater.CheckForUpdate(encodeURIComponent(this.museumName));
    },

    updateNone: function () {
        if (!this.manualCheck) { return; }
        this.manualCheck = false;
        this.showMessage("Check for updates", "You have the latest version (" + this.appVersion() + ").");
    },

    updateFailed: function () {
        if (!this.manualCheck) { return; }
        this.manualCheck = false;
        this.showMessage("Check for updates", "Could not check for updates. Please check your internet connection and try again.");
    },

    updateInstallFailed: function () {
        this.showMessage("Update", "Preware could not be opened. Preware is needed to install updates; " +
            "you can also update from App Museum II.");
    },

    showMessage: function (caption, html) {
        this.$.message.setCaption(caption);
        this.$.messageText.setContent(html);
        this.$.message.openAtCenter();
    },

    closeMessage: function () {
        this.$.message.close();
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
