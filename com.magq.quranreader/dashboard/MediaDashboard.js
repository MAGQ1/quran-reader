// The recitation card in the notification area: surah and verse, reciter, and
// Previous surah / Play-Pause / Next surah buttons. It only shows what the app sends
// and passes taps back; the app (source/MediaCard.js, Reader.js) does the playing.
// See MediaCard.js for how the two windows talk.

enyo.kind({
    name: "QuranMediaDashboard",
    kind: enyo.Control,
    className: "qd-card",

    components: [
        {kind: "ApplicationEvents", onWindowParamsChange: "paramsChanged"},
        {name: "icon", kind: "Image", className: "qd-icon", src: "../images/icon.png", onclick: "openTap"},
        {className: "qd-text", onclick: "openTap", components: [
            {name: "title", className: "qd-title"},
            {name: "text", className: "qd-sub"}
        ]},
        // The symbols are drawn in CSS: the device has no font with solid media glyphs
        // (see the pause bars in Reader.js).
        {className: "qd-button", onclick: "prevTap", allowHtml: true,
            content: '<span class="qd-bar"></span><span class="qd-tri-left"></span>'},
        {name: "toggle", className: "qd-button", onclick: "toggleTap", allowHtml: true},
        {className: "qd-button", onclick: "nextTap", allowHtml: true,
            content: '<span class="qd-tri-right"></span><span class="qd-bar"></span>'}
    ],

    create: function () {
        this.inherited(arguments);
        this.cardId = 0;
        this.sentClosed = false;
        this.show(enyo.windowParams || {});
        // Swiping the card away closes this window: tell the app, which stops playback.
        // (When the app closes the card itself it ignores this, see MediaCard.js.)
        var self = this;
        window.addEventListener("unload", function () { self.send("closed"); }, false);
    },

    paramsChanged: function () {
        this.show(enyo.windowParams || {});
    },

    show: function (p) {
        if (p.cardId) { this.cardId = p.cardId; }
        this.$.title.setContent(p.title || "Quran Reader");
        this.$.text.setContent(p.text || "");
        this.$.toggle.setContent(p.playing ?
            '<span class="qd-bar"></span><span class="qd-gap"></span><span class="qd-bar"></span>' :
            '<span class="qd-tri-right"></span>');
    },

    send: function (cmd) {
        if (cmd === "closed") {
            if (this.sentClosed) { return; }
            this.sentClosed = true;
        }
        try {
            if (window.opener) {
                window.opener.postMessage("quranMedia=" + enyo.json.stringify({cardId: this.cardId, cmd: cmd}), "*");
            }
        } catch (e) { /* the app is gone */ }
    },

    openTap: function () { this.send("open"); },
    prevTap: function () { this.send("prev"); },
    toggleTap: function () { this.send("toggle"); },
    nextTap: function () { this.send("next"); }
});
