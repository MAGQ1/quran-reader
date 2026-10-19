// Detects whether the "Quran Shaped" Arabic font is installed AND loaded.
//
// The font is installed on the device by the package's install script. The device
// only picks up a new font after a restart, so right after installing or updating
// the app the font can be on disk but not yet usable. In that state the Arabic
// shows as hollow boxes, so the app tells the user to restart.
//
// How the check works: draw a few characters that only our font has glyphs for,
// once with the font and once without it, in a hidden element. If the two widths
// are the same, the font is not active.

//
// Two routes to the font (style.css): installed on the TouchPad as "Quran Shaped", or
// loaded from the app as the web font "Quran Shaped Web" on newer engines (Lunacy,
// LuneOS), where no install script runs. Either one counts.

var QuranFont = {
    family: "'Quran Shaped', 'Quran Shaped Web'",
    webFamily: "Quran Shaped Web",

    // The first private-use characters our font defines (the letters of "Bismillah").
    sample: "",

    textWidth: function (fontFamily) {
        var span = document.createElement("span");
        span.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;" +
            "white-space:nowrap;font-size:100px;font-family:" + fontFamily;
        span.appendChild(document.createTextNode(this.sample));
        document.body.appendChild(span);
        var width = span.offsetWidth;
        document.body.removeChild(span);
        return width;
    },

    // true if the font is active. If the check itself fails we answer true, so a
    // glitch here can never nag the user or break the app.
    isLoaded: function () {
        try {
            var fallbacks = ["serif", "monospace"];
            for (var i = 0; i < fallbacks.length; i++) {
                var withFont = this.textWidth(this.family + ", " + fallbacks[i]);
                var without = this.textWidth(fallbacks[i]);
                if (withFont !== without) { return true; }
            }
            return false;
        } catch (e) {
            enyo.error("QuranFont.isLoaded failed: " + e);
            return true;
        }
    },

    // Declares the web font, on newer engines only. It must not exist on the TouchPad:
    // its browser accepts an @font-face rule, then draws hollow boxes instead of falling
    // back to the installed font. document.fonts is the test (the TouchPad has none).
    // The url is relative to index.html.
    addWebFont: function () {
        try {
            if (!document.fonts) { return; }
            var style = document.createElement("style");
            style.appendChild(document.createTextNode(
                "@font-face { font-family: '" + this.webFamily + "'; " +
                "src: url('fonts/QuranShaped.ttf') format('truetype'); }"));
            document.getElementsByTagName("head")[0].appendChild(style);
        } catch (e) {
            // No web font: newer engines then show the restart dialog, nothing worse.
        }
    },

    // Calls inDone once the web font has had its chance to load, so a slow load on a
    // newer engine is not mistaken for a missing font. Engines without document.fonts
    // (the TouchPad) never load web fonts anyway, so inDone runs straight away there.
    // Gives up waiting after 5 s; inDone runs exactly once.
    whenReady: function (inDone) {
        var done = false;
        var finish = function () {
            if (!done) { done = true; inDone(); }
        };
        try {
            if (!document.fonts || !document.fonts.load) { finish(); return; }
            setTimeout(finish, 5000);
            document.fonts.load("100px '" + this.webFamily + "'", this.sample).then(finish, finish);
        } catch (e) {
            finish();
        }
    }
};

QuranFont.addWebFont();   // as soon as this file loads, before anything is drawn
