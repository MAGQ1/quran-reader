// build-release.js -- make the installable package for other people.
//
//   node tools/build-release.js
//
// Runs palm-package, then adds the install scripts (tools/release/postinst.sh and
// prerm.sh) that put the Arabic font on the device, and fixes the package
// description. The result is dist/<app id>_<version>_all.ipk.
//
// IMPORTANT: a package with install scripts must be installed with Preware or
// WebOS Quick Install. palm-install does not run them (it is not root), so the
// app would install but Arabic would show as boxes.

var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var ipk = require("./ipk.js");

var root = path.join(__dirname, "..");
var appDir = path.join(root, "com.webosquran.reader");
var outDir = path.join(root, "dist");
var appinfo = JSON.parse(fs.readFileSync(path.join(appDir, "appinfo.json"), "utf8"));

if (!/^\d+\.\d+\.\d+$/.test(appinfo.version)) {
    throw new Error("appinfo.json version must be #.#.# (three numbers), got " + appinfo.version);
}
// Just Type looks in a database kind named after the app id (see source/JustType.js).
var jt = appinfo.universalSearch && appinfo.universalSearch.dbsearch;
if (jt && (jt.url !== appinfo.id || jt.dbQuery.from !== appinfo.id + ".surah:1")) {
    throw new Error("appinfo.json universalSearch.dbsearch must use the app id (" + appinfo.id + ") in \"url\" and \"dbQuery.from\" (" + appinfo.id + ".surah:1)");
}
if (!fs.existsSync(path.join(appDir, "fonts", "QuranShaped.ttf"))) {
    throw new Error("fonts/QuranShaped.ttf is missing - run tools/shape-arabic.py first");
}

fs.mkdirSync(outDir, { recursive: true });
var file = path.join(outDir, appinfo.id + "_" + appinfo.version + "_all.ipk");
if (fs.existsSync(file)) { fs.unlinkSync(file); }

console.log("1. palm-package ...");
cp.execSync('palm-package -o "' + outDir + '" "' + appDir + '"', { stdio: "inherit" });
if (!fs.existsSync(file)) { throw new Error("palm-package did not produce " + file); }

console.log("2. adding the install scripts ...");
var members = ipk.readIpk(file);
var original = {};
members.forEach(function (m) { original[m.name] = m.data; });

function script(name) {
    var text = fs.readFileSync(path.join(__dirname, "release", name), "utf8");
    // The scripts run on the device: they must have Unix line endings whatever git did.
    text = text.replace(/\r\n/g, "\n").replace(/@APP_ID@/g, appinfo.id);
    return Buffer.from(text, "utf8");
}

var now = Math.floor(Date.now() / 1000);
members.forEach(function (m) {
    if (m.name !== "control.tar.gz") { return; }
    var entries = ipk.readTarGz(m.data);
    var kept = [];
    entries.forEach(function (e) {
        if (/(^|\/)control$/.test(e.name)) {
            var text = e.data.toString("utf8");
            // Preware shows Description as the app's name until it has feed info.
            text = text.replace(/^Description:.*$/m, "Description: " + appinfo.title);
            text = text.replace(/^Maintainer:.*$/m, "Maintainer: " + appinfo.vendor);
            e.data = Buffer.from(text, "utf8");
            kept.unshift(e);      // control first
        } else if (!/(^|\/)(postinst|prerm)$/.test(e.name)) {
            kept.push(e);
        }
    });
    [["postinst", "postinst.sh"], ["prerm", "prerm.sh"]].forEach(function (pair) {
        kept.push({ name: "./" + pair[0], mode: 0o755, uid: 0, gid: 0, mtime: now, type: "0", data: script(pair[1]) });
    });
    m.data = ipk.writeTarGz(kept);
});
fs.writeFileSync(file, ipk.writeAr(members));

console.log("3. checking the result ...");
var check = ipk.readIpk(file);
var names = check.map(function (m) { return m.name; });
if (names.join(",") !== "debian-binary,control.tar.gz,data.tar.gz") {
    throw new Error("unexpected package members: " + names.join(","));
}
["debian-binary", "data.tar.gz"].forEach(function (n) {
    var now2 = check.filter(function (m) { return m.name === n; })[0].data;
    if (!now2.equals(original[n])) { throw new Error(n + " changed - it must stay identical"); }
});
var ctl = ipk.readTarGz(check.filter(function (m) { return m.name === "control.tar.gz"; })[0].data);
ctl.forEach(function (e) {
    console.log("   control.tar.gz: " + (e.mode & 0o777).toString(8) + "  " + e.name + "  (" + e.data.length + " bytes)");
});
var post = ctl.filter(function (e) { return /postinst$/.test(e.name); })[0];
if (!post || post.mode !== 0o755 || post.data.toString("utf8").indexOf("\r") !== -1 ||
    post.data.toString("utf8").indexOf("@APP_ID@") !== -1) {
    throw new Error("postinst is missing, not executable, has Windows line endings or an unfilled placeholder");
}
console.log("\nBuilt " + file + " (" + Math.round(fs.statSync(file).size / 1024) + " KB)");
console.log("Install it with Preware or WebOS Quick Install - NOT palm-install.");
