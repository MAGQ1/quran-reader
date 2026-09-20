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

var QuranFont = {
    family: "Quran Shaped",

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
                var withFont = this.textWidth("'" + this.family + "', " + fallbacks[i]);
                var without = this.textWidth(fallbacks[i]);
                if (withFont !== without) { return true; }
            }
            return false;
        } catch (e) {
            enyo.error("QuranFont.isLoaded failed: " + e);
            return true;
        }
    }
};
