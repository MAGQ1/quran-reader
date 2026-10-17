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
            {caption: "Transliteration", components: QuranMenuItems("translit_", QuranSources.transliterations, "pickTranslit", "translit")},
            {caption: "Verse numbers", components: QuranMenuItems("numbers_", QuranSources.numberStyles, "pickNumbers", "numbers")},
            {caption: "Theme", components: QuranMenuItems("theme_", QuranSources.themes, "pickTheme", "theme")},
            {caption: "Recitation", components: [
                {caption: "Reciter", components: QuranMenuItems("reciter_", QuranSources.reciters, "pickReciter", "reciter")},
                {caption: "Pause between verses", components: QuranMenuItems("pause_", QuranSources.pauseLengths, "pickPauseLength", "pauseLength")}
            ]},
            {caption: "Check for updates", onclick: "checkUpdatesTap"},
            {caption: "About", onclick: "showAbout"}
        ]},
        {name: "pane", kind: "Pane", flex: 1, components: [
            {name: "home", kind: "QuranHome", onOpenSurah: "openSurah"},
            {name: "reader", kind: "QuranReader", onBack: "showHome", onProgress: "saveProgress", onAudioError: "readerAudioError"}
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
            // The text scrolls inside a box sized to the screen (fitAbout) so the version
            // and Close button always stay on screen. Enyo's scroller has no scroll bar,
            // so aboutTrack/aboutThumb draw one (updateAboutBar).
            {kind: "HFlexBox", components: [
            {name: "aboutScroller", kind: "Scroller", flex: 1, className: "q-about-scroller", onScroll: "updateAboutBar", components: [
            {name: "aboutText", allowHtml: true, style: "padding: 8px 0;", onclick: "aboutClick", content:
                "All praise is due to Allah, the Most High.<br><br>" +
                "Arabic text: <a href=\"#\" class=\"q-link\" data-url=\"http://tanzil.net\">Tanzil Project (tanzil.net)</a>, " +
                "Uthmani and Simple (Imla'ei) scripts, version 1.1. Copyright (C) 2007-2026 Tanzil Project, " +
                "<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by/3.0/\">Creative Commons Attribution 3.0</a>. " +
                "The text is unchanged.<br><br>" +
                "English translations: <a href=\"#\" class=\"q-link\" data-url=\"https://www.clearquran.com\">Translation by Talal Itani, ClearQuran.com</a> " +
                "(<a href=\"#\" class=\"q-link\" data-url=\"http://creativecommons.org/licenses/by-nd/4.0/\">CC BY-ND 4.0</a>), and " +
                "The Meaning of the Glorious Koran by Marmaduke Pickthall (public domain).<br><br>" +
                "Transliteration: \"English Transliteration\" from the " +
                "<a href=\"#\" class=\"q-link\" data-url=\"https://tanzil.net/trans/\">Tanzil Project</a> " +
                "(non-commercial use). How to read it: <u>underlined</u> letters are long vowels or heavy letters; " +
                "<b>bold</b> letters are silent, or dropped when you stop at that word; an underlined <i><u>th</u></i> " +
                "in italics is the letter dha; AA stands for the letter ayn.<br><br>" +
                "Arabic font: Amiri Quran, modified as \"Quran Shaped\" (SIL Open Font License 1.1).<br><br>" +
                "Recitation audio: Mishary Alafasy, Mahmoud Khalil Al-Husary and Abdul Basit Abdul Samad (Murattal), " +
                "courtesy of <a href=\"#\" class=\"q-link\" data-url=\"https://everyayah.com\">EveryAyah.com</a> and " +
                "VerseByVerseQuran.com. Fetched one verse at a time and deleted after listening; not modified.<br><br>" +
                "This app is free and non-commercial.<br><br>" +
                "Update check: the app asks appcatalog.webosarchive.org whether a newer version exists. " +
                "It sends the app version, your device model and webOS version, and a random ID made by this app " +
                "(no serial number).<br><br>" +
                "Any errors in the displaying of the Quran were done purely by accident. " +
                "Contact MAGQ on the webOS Archive server if there are any. " +
                "May Allah forgive those mistakes."}
            ]},
            {name: "aboutTrack", className: "q-scroll-track", components: [
                {name: "aboutThumb", className: "q-scroll-thumb"}
            ]}
            ]},
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
        this.reciter = QuranSources.find(QuranSources.reciters, QuranPrefs.get("reciter", null));
        this.pauseLength = QuranSources.find(QuranSources.pauseLengths, QuranPrefs.get("pauseLength", null));
        this.translit = QuranSources.find(QuranSources.transliterations, QuranPrefs.get("translit", null));
        this.position = QuranPrefs.get("position", null);
        if (this.position && !(this.position.surah >= 1 && this.position.surah <= 114 && this.position.ayah >= 1)) {
            this.position = null;
        }

        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
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
        this.watchRotation();
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
        this.$.home.refreshBookmarks();
        this.$.pane.selectView(this.$.home);
    },

    saveProgress: function (inSender, surah, ayah) {
        this.position = {surah: surah, ayah: ayah};
        QuranPrefs.set("position", this.position);
        this.$.home.setResume(this.position);
    },

    readerAudioError: function () {
        this.showMessage("Playback", "This verse's recitation could not be played. Please check your internet connection and try again.");
    },

    // ---- menu ----

    pickScript: function (inSender) {
        this.script = QuranSources.find(QuranSources.scripts, inSender.sourceId);
        QuranPrefs.set("script", this.script.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
    },

    pickTranslation: function (inSender) {
        this.translation = QuranSources.find(QuranSources.translations, inSender.sourceId);
        QuranPrefs.set("translation", this.translation.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
    },

    pickTranslit: function (inSender) {
        this.translit = QuranSources.find(QuranSources.transliterations, inSender.sourceId);
        QuranPrefs.set("translit", this.translit.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
    },

    pickNumbers: function (inSender) {
        this.numbers = QuranSources.find(QuranSources.numberStyles, inSender.sourceId);
        QuranPrefs.set("numbers", this.numbers.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
    },

    pickTheme: function (inSender) {
        this.theme = QuranSources.find(QuranSources.themes, inSender.sourceId);
        QuranPrefs.set("theme", this.theme.id);
        this.updateMenuChecks();
        this.applyTheme();
    },

    pickReciter: function (inSender) {
        this.reciter = QuranSources.find(QuranSources.reciters, inSender.sourceId);
        QuranPrefs.set("reciter", this.reciter.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
    },

    pickPauseLength: function (inSender) {
        this.pauseLength = QuranSources.find(QuranSources.pauseLengths, inSender.sourceId);
        QuranPrefs.set("pauseLength", this.pauseLength.id);
        this.updateMenuChecks();
        this.$.reader.setSources(this.script, this.translation, this.numbers, this.reciter, this.pauseLength, this.translit);
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
        QuranSources.transliterations.forEach(function (t) {
            var item = self.$["translit_" + t.id];
            if (item) { item.setChecked(t.id === self.translit.id); }
        });
        QuranSources.numberStyles.forEach(function (n) {
            var item = self.$["numbers_" + n.id];
            if (item) { item.setChecked(n.id === self.numbers.id); }
        });
        QuranSources.themes.forEach(function (t) {
            var item = self.$["theme_" + t.id];
            if (item) { item.setChecked(t.id === self.theme.id); }
        });
        QuranSources.reciters.forEach(function (r) {
            var item = self.$["reciter_" + r.id];
            if (item) { item.setChecked(r.id === self.reciter.id); }
        });
        QuranSources.pauseLengths.forEach(function (p) {
            var item = self.$["pause_" + p.id];
            if (item) { item.setChecked(p.id === self.pauseLength.id); }
        });
    },

    showAbout: function () {
        this.$.aboutVersion.setContent("Version " + this.appVersion());
        this.$.about.openAtCenter();
        this.fitAbout();
    },

    // Makes the About text box as tall as the screen allows (landscape or portrait),
    // starts it at the top, and re-centres the dialog. Needs the dialog open to measure.
    // inKeepPlace (after a rotation) keeps the reader's place instead of going to the top.
    fitAbout: function (inKeepPlace) {
        var scroller = this.$.aboutScroller.hasNode();
        var text = this.$.aboutText.hasNode();
        var dialog = this.$.about.hasNode();
        if (!scroller || !text || !dialog) { return; }
        var place = this.$.aboutScroller.scrollTop;
        // Measure from a small known size: once the dialog is taller than the screen,
        // Enyo squeezes it to fit and its measured height is no longer the real one.
        this.$.aboutScroller.applyStyle("height", "200px");
        this.$.about.clearClampedSize();
        var chrome = dialog.offsetHeight - scroller.offsetHeight;   // title, version, Close, padding
        var room = Math.max(150, window.innerHeight - chrome - 40);
        var fits = text.offsetHeight <= room;
        this.$.aboutScroller.applyStyle("height", Math.min(room, text.offsetHeight) + "px");
        this.$.aboutTrack.applyStyle("visibility", fits ? "hidden" : "visible");
        var b = this.$.aboutScroller.getBoundaries();
        this.$.aboutScroller.setScrollTop(inKeepPlace ? Math.max(b.top, Math.min(b.bottom, place)) : 0);
        this.$.about.applyBoundsInfo();
        this.updateAboutBar();
    },

    // Sizes and moves the scroll bar thumb to match the About text's scroll position.
    updateAboutBar: function () {
        var s = this.$.aboutScroller;
        var track = this.$.aboutTrack.hasNode();
        if (!s.hasNode() || !track) { return; }
        var b = s.getBoundaries();
        var range = b.bottom - b.top;
        var view = s.hasNode().clientHeight;
        var trackH = track.clientHeight;
        var thumbH = Math.max(40, Math.round(trackH * view / (view + range)));
        var top = range > 0 ? (s.scrollTop - b.top) / range * (trackH - thumbH) : 0;
        top = Math.max(0, Math.min(trackH - thumbH, top));   // stays inside during the bounce
        this.$.aboutThumb.applyStyle("height", thumbH + "px");
        this.$.aboutThumb.applyStyle("top", Math.round(top) + "px");
    },

    // Rotating the TouchPad while About is open re-sizes it for the new screen shape.
    // Listens to the window itself; the short wait lets Enyo's own re-centring of the
    // dialog (also on resize) happen first, so this one has the last word.
    watchRotation: function () {
        var self = this;
        window.addEventListener("resize", function () {
            setTimeout(function () {
                if (self.$.about.isOpen) { self.fitAbout(true); }
            }, 100);
        }, false);
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
