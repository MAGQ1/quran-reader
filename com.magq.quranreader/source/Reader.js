// Reader screen: shows one surah, Arabic and translation side by side per
// verse, and reports the verse at the top of the screen so progress is saved.

enyo.kind({
    name: "QuranReader",
    kind: enyo.VFlexBox,

    events: {
        onBack: "",
        onProgress: "",   // (surahNumber, ayahNumber)
        onAudioError: ""
    },

    components: [
        {kind: "Toolbar", components: [
            {kind: "Button", caption: "Back", onclick: "backTap"},
            {name: "title", flex: 1, className: "q-title"},
            {name: "gotoInput", kind: "Input", className: "q-goto", hint: "Go to verse...", onchange: "gotoTap"},
            // Grouped and bordered together (q-audio-group in style.css) so it
            // reads as one "audio" control, not two unrelated toolbar items.
            {kind: "HFlexBox", align: "center", className: "q-audio-group", components: [
                {name: "playButton", kind: "Button", allowHtml: true, caption: "▶", onclick: "playTap"},
                {name: "playInput", kind: "Input", className: "q-play-verse", hint: "Play from verse...", onchange: "playVerseTap"}
            ]},
            {name: "prevButton", kind: "Button", caption: "Prev Surah", onclick: "prevTap"},
            {name: "nextButton", kind: "Button", caption: "Next Surah", onclick: "nextTap"}
        ]},
        {name: "scroller", kind: "Scroller", flex: 1, onScrollStop: "scrollStopped", components: [
            {name: "body", className: "reader-body", allowHtml: true, onclick: "bodyClick"}
        ]},
        // The recitation fetch service (com.magq.quranreader.service): downloads each
        // verse to local storage so the audio element plays a file:// URL instead of
        // fetching https:// itself, which stalls on this device (see the service's header).
        // PalmService is one method per component.
        {name: "svcFetch", kind: "PalmService", service: "palm://com.magq.quranreader.service/", method: "fetchVerse",
            onSuccess: "svcResponse", onFailure: "svcFailed"},
        {name: "svcStatus", kind: "PalmService", service: "palm://com.magq.quranreader.service/", method: "getFetchStatus",
            onSuccess: "svcResponse", onFailure: "svcFailed"},
        {name: "svcRelease", kind: "PalmService", service: "palm://com.magq.quranreader.service/", method: "releaseVerse"},
        {name: "svcClear", kind: "PalmService", service: "palm://com.magq.quranreader.service/", method: "clearCache"}
    ],

    create: function () {
        this.inherited(arguments);
        this.surah = 0;       // surah currently shown (0 = none yet)
        this.topAyah = 1;     // verse at the top of the screen
        this.verseCount = 0;  // verses in the current surah (for "next verse"/range checks)
        this.textShown = false;   // true once the text is on screen
        this.token = 0;       // lets us ignore out-of-date loads
        this.script = QuranSources.scripts[0];
        this.translation = QuranSources.translations[0];
        this.numbers = QuranSources.numberStyles[0];
        this.reciter = QuranSources.reciters[0];
        this.pauseLength = QuranSources.pauseLengths[0];
        this.playing = false;   // true while a verse is playing or between verses
        this.playAyah = 0;      // the verse currently playing
        this.playSingle = false; // true if the current play is "just this one ayah"
        this.pauseTimer = null;  // the gap between verses, so it can be cancelled
        this.playToken = 0;      // bumped on every start/pause/stop so late async results can tell they are stale
        this.local = {};         // verse key -> {state: "fetching"|"ready"|"failed", url} from the fetch service
        this.waiting = {};       // verse key -> callbacks waiting for that verse to be ready
        this.pollTimer = null;
        this.serviceOk = true;   // false once a service call itself fails (not installed/registered): play remote URLs directly
        this.remoteSrc = false;  // true while the audio element is playing a remote URL (fallback), not a local file
    },

    rendered: function () {
        this.inherited(arguments);
        this.createAudioNode();
        this.watchForStuckPlayback();    },

    // A plain HTML5 Audio object, not shown -- controlled directly (play/pause/src,
    // and the native "ended"/"error" events; Enyo's own event system does not cover
    // media-element events). It does not need to be in the DOM tree. Created once and
    // reused for every verse of every surah (reassigning .src is the normal way).
    //
    // Do NOT add a second element to preload the next verse: the device's media server
    // allows one active pipeline, and loading another session logs "MediaResourceArbitration
    // ::suspend: Suspending pipeline. Cause: playback pipeline request" -- it suspends the
    // verse that is playing, cutting it off mid-ayah (tried; confirmed in the log).
    createAudioNode: function () {
        var self = this;
        this.audioNode = new Audio();
        this.audioNode.addEventListener("ended", function () { self.audioEnded(); });
        this.audioNode.addEventListener("error", function () { self.audioErrored(); });
    },

    // FALLBACK ONLY (used when the fetch service is not available and a verse is
    // played straight from its remote URL). On this device the audio element can get
    // permanently stuck at readyState 0 fetching a remote https:// URL -- no error,
    // .paused false -- and only a pause, a fresh src and play() issued from inside a
    // REAL touch un-wedges it (the same sequence from a timer did not). So this
    // recovers on the user's next tap anywhere. Never applies to local files, which
    // do not have the problem.
    watchForStuckPlayback: function () {
        var self = this;
        var recover = function () {
            var node = self.audioNode;
            if (self.playing && self.remoteSrc && node.readyState === 0) {
                node.pause();
                node.src = self.audioUrl(self.playAyah);
                node.play();
            }
        };
        document.addEventListener("touchstart", recover, true);
        document.addEventListener("mousedown", recover, true);
    },

    // Called by the app when the user picks another script, translation, number
    // style, reciter or pause length. Redraws the current surah and keeps the
    // reader at the same verse.
    setSources: function (script, translation, numbers, reciter, pauseLength) {
        this.script = script;
        this.translation = translation;
        this.numbers = numbers || QuranSources.numberStyles[0];
        this.reciter = reciter || QuranSources.reciters[0];
        this.pauseLength = pauseLength || QuranSources.pauseLengths[0];
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

        this.stopPlayback();
        this.resetVerseCache();
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
        this.verseCount = arabic.length;
        if (meta.bismillah) {
            html.push('<div class="q-bismillah"' + font + '>' + this.escapeHtml(bismillah) + '</div>');
        }
        arabic.forEach(function (text, i) {
            var n = i + 1;
            html.push(
                '<div class="q-ayah" id="ayah-' + n + '">' +
                // data-ayah on the play links is read by bodyClick (one delegated
                // handler for the whole reader body -- see App.js aboutClick for
                // the same pattern with the About dialog's links). q-play-continue
                // plays from this verse onward; q-play-ayah plays just this verse.
                '<a href="#" class="q-play-continue" data-ayah="' + n + '" title="Play from here onward">▶▼</a>' +
                '<a href="#" class="q-play-ayah" data-ayah="' + n + '" title="Play just this verse">▶</a>' +
                '<div class="q-ar"' + font + '>' + self.escapeHtml(text) +
                ' <span class="q-ar-num">﴾' + (self.numbers.id === "regular" ? n : self.arabicDigits(n)) + '﴿</span></div>' +
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
        // Verse 1 means "the start of the surah": show it from the very top, so the
        // bismillah heading above the first verse is visible too.
        if (n <= 1) {
            this.$.scroller.setScrollTop(0);
            return;
        }
        var node = this.$.body.hasNode();
        var el = node && node.querySelector("#ayah-" + n);
        this.$.scroller.setScrollTop(el ? el.offsetTop : 0);
    },

    // ---- audio playback ----
    // Streamed per-verse from everyayah.com / VerseByVerseQuran.com -- see
    // CREDITS.txt for the licence terms. Nothing is downloaded ahead of time or
    // cached; each verse is fetched when it is about to play.

    audioUrl: function (ayah) {
        return "https://everyayah.com/data/" + this.reciter.folder + "/" +
            QuranData.pad3(this.surah) + QuranData.pad3(ayah) + ".mp3";
    },

    // The toolbar Play/Pause button: continues from the verse at the top of the
    // screen (or resumes/pauses whatever is already playing).
    playTap: function () {
        if (this.playing) { this.pausePlayback(); return; }
        this.playSingle = false;
        this.startPlayback(this.playAyah || this.topAyah || 1);
    },

    // A verse's own play links: the plain triangle plays just that ayah; the
    // triangle-with-down-arrow plays from that ayah onward (continuous).
    bodyClick: function (inSender, inEvent) {
        var el = inEvent && inEvent.target;
        var ayah = el && el.getAttribute && el.getAttribute("data-ayah");
        if (ayah) {
            if (inEvent.preventDefault) { inEvent.preventDefault(); }
            this.playSingle = !(el.className && el.className.indexOf("q-play-continue") !== -1);
            this.startPlayback(parseInt(ayah, 10));
        }
    },

    // "Go to verse...": scrolls there only, no audio.
    gotoTap: function (inSender) {
        var n = parseInt(inSender.getValue(), 10);
        inSender.setValue("");
        if (n >= 1 && n <= this.verseCount) { this.scrollToAyah(n); }
    },

    // "Play verse...": starts continuous playback there (same as the toolbar
    // Play button, just starting from a typed verse instead of the top verse).
    playVerseTap: function (inSender) {
        var n = parseInt(inSender.getValue(), 10);
        inSender.setValue("");
        if (n >= 1 && n <= this.verseCount) {
            this.playSingle = false;
            this.startPlayback(n);
        }
    },

    startPlayback: function (ayah) {
        if (ayah < 1 || ayah > this.verseCount) { return; }
        var self = this;
        var token = ++this.playToken;
        this.cancelPauseTimer();
        this.playing = true;
        this.playAyah = ayah;
        this.$.playButton.setCaption('<span class="q-bar"></span><span class="q-bar"></span>');   // drawn in CSS: no font has a solid pause glyph on this device

        // Wait for the fetch service to have the verse on local storage (usually already
        // there for every verse after the first, thanks to the prefetch below), then play it.
        this.requestVerse(ayah, function (url) {
            if (token !== self.playToken || !self.playing) { return; }   // paused/stopped/moved on meanwhile
            self.remoteSrc = !url;
            self.audioNode.src = url || self.audioUrl(ayah);
            self.audioNode.play();
            self.prefetchNext(ayah);
            self.releaseVerse(ayah - 1);
        });

        // Highlight and scroll a moment AFTER play() has been issued: the layout work is slow
        // on this device and used to sit in front of play(), adding to the gap between verses.
        setTimeout(function () {
            if (token === self.playToken) { self.highlightAyah(ayah); }
        }, 0);
    },

    // ---- the fetch service (see com.magq.quranreader.service/QuranAudioService.js) ----

    verseKey: function (ayah) {
        return this.reciter.id + "_" + QuranData.pad3(this.surah) + QuranData.pad3(ayah);
    },

    // Makes sure the verse is (being) fetched. done(url) is called once it is ready, with its
    // local file:// URL, or done(null) if it cannot be had locally (service missing or the
    // download failed) -- the caller then falls back to the remote URL.
    requestVerse: function (ayah, done) {
        var key = this.verseKey(ayah);
        var rec = this.local[key];
        if (!this.serviceOk) { if (done) { done(null); } return; }
        if (rec && rec.state === "ready") { if (done) { done(rec.url); } return; }
        if (!rec || rec.state === "failed") {
            rec = this.local[key] = {state: "fetching", asked: 1, remote: this.audioUrl(ayah)};
            this.$.svcFetch.call({key: key, url: rec.remote});
        }
        if (done) {
            (this.waiting[key] = this.waiting[key] || []).push(done);
            this.startPolling();
        }
    },

    // A background fetch of the next verse while this one plays, so it is already on the
    // device when needed. Nothing in single-verse mode -- there is no next verse.
    prefetchNext: function (ayah) {
        // Only downloads it to local storage (never loads it into an audio element -- see
        // createAudioNode). The empty callback is what keeps the status polling going until
        // it is ready.
        if (!this.playSingle && ayah + 1 <= this.verseCount) { this.requestVerse(ayah + 1, function () {}); }
    },

    // Deletes a verse's local file once playback has moved past it (the files are a
    // transient buffer, not a library).
    releaseVerse: function (ayah) {
        if (ayah < 1 || !this.serviceOk) { return; }
        var key = this.verseKey(ayah);
        if (this.local[key]) {
            delete this.local[key];
            this.$.svcRelease.call({key: key});
        }
    },

    // Forgets everything about the previous surah's verses (called when another surah loads).
    resetVerseCache: function () {
        this.local = {};
        this.waiting = {};
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        if (this.serviceOk) { this.$.svcClear.call({}); }
    },

    // Asks the service how the waited-for verses are getting on, until none is left waiting.
    startPolling: function () {
        var self = this;
        if (this.pollTimer) { return; }
        this.pollTimer = setInterval(function () {
            var any = false, key;
            for (key in self.waiting) {
                if (self.waiting.hasOwnProperty(key)) { any = true; self.$.svcStatus.call({key: key}); }
            }
            if (!any) { clearInterval(self.pollTimer); self.pollTimer = null; }
        }, 150);
    },

    settleVerse: function (key, url) {
        var callbacks = this.waiting[key];
        delete this.waiting[key];
        if (callbacks) { callbacks.forEach(function (cb) { cb(url); }); }
    },

    // Reply to fetchVerse / getFetchStatus.
    svcResponse: function (inSender, inResponse) {
        var key = inResponse && inResponse.key;
        var rec = key && this.local[key];
        if (!rec) { return; }   // a reply about a verse we have since forgotten
        if (inResponse.state === "ready" && inResponse.url) {
            rec.state = "ready";
            rec.url = inResponse.url;
            this.settleVerse(key, rec.url);
        } else if (inResponse.state === "failed" || inResponse.returnValue === false) {
            rec.state = "failed";
            enyo.error("Verse download failed: " + (inResponse.errorText || key));
            this.settleVerse(key, null);
        } else if (inResponse.state === "none" && rec.state === "fetching") {
            // The service lost track of it (it exits when idle): ask once more, then give up.
            if (rec.asked < 2) { rec.asked++; this.$.svcFetch.call({key: key, url: rec.remote}); }
            else { rec.state = "failed"; this.settleVerse(key, null); }
        }
    },

    // The service call itself failed: it is not installed or not registered on the Luna bus.
    // Play remote URLs directly from now on (the stuck-playback recovery covers that case).
    svcFailed: function (inSender, inResponse) {
        enyo.error("Recitation service unavailable, playing remote URLs directly: " + enyo.json.stringify(inResponse));
        this.serviceOk = false;
        var key;
        for (key in this.waiting) {
            if (this.waiting.hasOwnProperty(key)) { this.settleVerse(key, null); }
        }
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    },

    pausePlayback: function () {
        this.playing = false;
        ++this.playToken;
        this.$.playButton.setCaption("▶");
        this.audioNode.pause();
        this.cancelPauseTimer();
    },

    // Pause and forget which verse we were on (used when leaving the surah
    // entirely -- Back, Previous/Next, or a script/translation/reciter change).
    stopPlayback: function () {
        this.pausePlayback();
        this.playAyah = 0;
        this.clearHighlight();
    },

    cancelPauseTimer: function () {
        if (this.pauseTimer) { clearTimeout(this.pauseTimer); this.pauseTimer = null; }
    },

    audioEnded: function () {
        if (!this.playing) { return; }   // a stray event after we already stopped
        if (this.playSingle) { this.stopPlayback(); return; }
        var next = this.playAyah + 1;
        if (next > this.verseCount) { this.stopPlayback(); return; }
        if (!this.pauseLength.ms) { this.startPlayback(next); return; }
        var self = this;
        this.cancelPauseTimer();
        this.pauseTimer = setTimeout(function () {
            self.pauseTimer = null;
            self.startPlayback(next);
        }, this.pauseLength.ms);
    },

    audioErrored: function () {
        if (!this.playing) { return; }
        if (!this.remoteSrc) {
            // The local copy would not play (deleted underneath us?): try the remote URL once.
            var rec = this.local[this.verseKey(this.playAyah)];
            if (rec) { rec.state = "failed"; }
            this.remoteSrc = true;
            this.audioNode.src = this.audioUrl(this.playAyah);
            this.audioNode.play();
            return;
        }
        this.stopPlayback();
        this.doAudioError();
    },

    highlightAyah: function (n) {
        this.clearHighlight();
        var node = this.$.body.hasNode();
        var el = node && node.querySelector("#ayah-" + n);
        if (el) { el.className += " q-playing"; }
        this.scrollToAyah(n);
    },

    clearHighlight: function () {
        var node = this.$.body.hasNode();
        if (!node) { return; }
        var els = node.querySelectorAll(".q-playing");
        for (var i = 0; i < els.length; i++) {
            els[i].className = els[i].className.replace(/\s*\bq-playing\b/, "");
        }
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

    backTap: function () {
        this.stopPlayback();
        this.doBack();
    },

    // ---- previous / next surah ----

    prevTap: function () {
        if (this.surah > 1) { this.open(this.surah - 1, 1); }
    },

    nextTap: function () {
        if (this.surah < 114) { this.open(this.surah + 1, 1); }
    }
});
