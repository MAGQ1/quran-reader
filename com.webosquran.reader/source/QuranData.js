// Loads the JSON data files bundled inside the app.

var QuranData = {
    cache: {},

    pad3: function (n) {
        return ("00" + n).slice(-3);
    },

    // Loads one JSON file. callback(error, data). Small index files can be
    // cached; surah text is not, to keep memory use low.
    loadJson: function (url, useCache, callback) {
        var self = this;
        if (useCache && this.cache[url]) {
            callback(null, this.cache[url]);
            return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) { return; }
            // Files inside the app report status 0 on success.
            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                var data;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) {
                    callback(new Error("Bad JSON in " + url + ": " + e));
                    return;
                }
                if (useCache) { self.cache[url] = data; }
                callback(null, data);
            } else {
                callback(new Error("HTTP " + xhr.status + " loading " + url));
            }
        };
        xhr.send(null);
    },

    // Loads several files at once. requests = [{url, cache}, ...].
    // callback(error, [data, ...]) with results in the same order.
    loadMany: function (requests, callback) {
        var results = [];
        var remaining = requests.length;
        var failed = false;
        requests.forEach(function (req, i) {
            QuranData.loadJson(req.url, req.cache, function (err, data) {
                if (failed) { return; }
                if (err) {
                    failed = true;
                    callback(err);
                    return;
                }
                results[i] = data;
                remaining--;
                if (remaining === 0) { callback(null, results); }
            });
        });
    }
};
