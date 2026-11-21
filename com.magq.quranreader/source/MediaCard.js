// The "now playing" card in webOS's notification area, shown while a recitation is
// playing or paused (Reader.updateMediaCard decides when). The card itself is a
// separate small window, dashboard/index.html (dashboard/MediaDashboard.js), with
// Previous surah / Play-Pause / Next surah buttons.
//
// How the two windows talk (the same way Enyo's own enyo.Dashboard does):
//   app -> card: window params (enyo.windows.setWindowParams), {cardId, title, text, playing}
//   card -> app: window.opener.postMessage("quranMedia=" + JSON {cardId, cmd}), with cmd
//     "toggle", "prev", "next", "open" (text or icon tapped) or "closed" (the user
//     swiped the card away; the card's window sends it as it unloads).
// cardId tells messages from an old, already-closed card apart from the current one:
// after hide() + show() the old card's "closed" can arrive after the new card opened.

enyo.kind({
    name: "QuranMediaCard",
    kind: enyo.Component,

    events: {
        onCommand: ""     // (cmd): "toggle", "prev", "next", "open" or "closed"
    },

    components: [
        // The card must not outlive the app: its buttons would control nothing.
        {kind: "ApplicationEvents", onUnload: "hide"}
    ],

    create: function () {
        this.inherited(arguments);
        this.win = null;
        this.cardId = 0;
        this.boundMessage = enyo.bind(this, "handleMessage");
        window.addEventListener("message", this.boundMessage, false);
    },

    destroy: function () {
        this.hide();
        window.removeEventListener("message", this.boundMessage, false);
        this.inherited(arguments);
    },

    // state: {title, text, playing}. Opens the card, or updates the one that is open.
    show: function (state) {
        var params = {title: state.title, text: state.text, playing: !!state.playing};
        try {
            if (this.isOpen()) {
                params.cardId = this.cardId;
                enyo.windows.setWindowParams(this.win, params);
            } else {
                params.cardId = ++this.cardId;
                // clickableWhenLocked: the buttons work from the lock screen too.
                this.win = enyo.windows.openDashboard("dashboard/index.html", "quranMedia" + this.cardId,
                    params, {clickableWhenLocked: true});
            }
        } catch (e) {
            // Never let the card break playback.
            enyo.error("Could not show the recitation card: " + e);
            this.win = null;
        }
    },

    hide: function () {
        var w = this.win;
        this.win = null;
        ++this.cardId;   // anything the closing card still sends is now stale
        if (w) {
            try { w.close(); } catch (e) { /* already gone */ }
        }
    },

    // A closed window can have its JS bindings removed, so 'closed' may read
    // undefined instead of true (Enyo's Dashboard.js checks it the same way).
    isOpen: function () {
        return !!this.win && this.win.closed === false;
    },

    handleMessage: function (e) {
        var label = "quranMedia=";
        if (typeof e.data !== "string" || e.data.indexOf(label) !== 0) { return; }
        var msg;
        try { msg = enyo.json.parse(e.data.slice(label.length)); } catch (err) { return; }
        if (!msg || msg.cardId !== this.cardId || !this.win) { return; }
        if (msg.cmd === "closed") {
            this.win = null;   // the user swiped it away; it is gone already
        }
        this.doCommand(msg.cmd);
    }
});
