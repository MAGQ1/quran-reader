// ipk.js -- read and write webOS .ipk packages without needing `ar` or `tar`.
//
// An .ipk is an `ar` archive holding three files (debian-binary, control.tar.gz,
// data.tar.gz). The two .tar.gz members are gzipped tar archives. This module can
// read and write all three layers, so a build script can open a package made by
// palm-package, add install scripts to control.tar.gz, and put it back together.
//
// Command line (handy for looking inside a package):
//   node tools/ipk.js list <file.ipk>
//
// ES2015+ is fine here: this runs on the PC, not on the TouchPad.

var fs = require("fs");
var zlib = require("zlib");

// ---------------------------------------------------------------- ar ----------

function readAr(buf) {
    if (buf.toString("latin1", 0, 8) !== "!<arch>\n") {
        throw new Error("Not an ar archive (missing !<arch> header)");
    }
    var members = [];
    var pos = 8;
    var gnuNames = null;
    while (pos + 60 <= buf.length) {
        var name = buf.toString("latin1", pos, pos + 16).trim();
        var mtime = parseInt(buf.toString("latin1", pos + 16, pos + 28), 10) || 0;
        var uid = parseInt(buf.toString("latin1", pos + 28, pos + 34), 10) || 0;
        var gid = parseInt(buf.toString("latin1", pos + 34, pos + 40), 10) || 0;
        var mode = buf.toString("latin1", pos + 40, pos + 48).trim();
        var size = parseInt(buf.toString("latin1", pos + 48, pos + 58), 10);
        pos += 60;
        var data = buf.slice(pos, pos + size);
        pos += size + (size % 2);   // members are padded to an even length
        if (name === "//") {        // GNU long-name table
            gnuNames = data.toString("latin1");
            continue;
        }
        var m = /^\/(\d+)$/.exec(name);
        if (m && gnuNames !== null) {
            var end = gnuNames.indexOf("\n", parseInt(m[1], 10));
            name = gnuNames.slice(parseInt(m[1], 10), end).replace(/\/$/, "");
        } else if (name.indexOf("#1/") === 0) {   // BSD long name: name is at the start of data
            var n = parseInt(name.slice(3), 10);
            name = data.toString("latin1", 0, n).replace(/\0+$/, "");
            data = data.slice(n);
        } else {
            name = name.replace(/\/$/, "");
        }
        members.push({ name: name, mtime: mtime, uid: uid, gid: gid, mode: mode || "100644", data: data });
    }
    return members;
}

function pad(str, len) {
    str = String(str);
    if (str.length > len) { throw new Error("ar field too long: " + str); }
    return str + new Array(len - str.length + 1).join(" ");
}

function writeAr(members) {
    var parts = [Buffer.from("!<arch>\n", "latin1")];
    members.forEach(function (m) {
        if (m.name.length > 15) { throw new Error("ar member name too long: " + m.name); }
        var header = pad(m.name + "/", 16) + pad(m.mtime || 0, 12) + pad(m.uid || 0, 6) +
            pad(m.gid || 0, 6) + pad(m.mode || "100644", 8) + pad(m.data.length, 10) + "`\n";
        parts.push(Buffer.from(header, "latin1"), m.data);
        if (m.data.length % 2) { parts.push(Buffer.from("\n", "latin1")); }
    });
    return Buffer.concat(parts);
}

// --------------------------------------------------------------- tar ----------

function cstr(buf, start, len) {
    var s = buf.toString("utf8", start, start + len);
    var z = s.indexOf("\0");
    return z === -1 ? s : s.slice(0, z);
}

function readTar(buf) {
    var entries = [];
    var pos = 0;
    var longName = null;
    while (pos + 512 <= buf.length) {
        var header = buf.slice(pos, pos + 512);
        if (header.every(function (b) { return b === 0; })) { break; }
        var name = cstr(header, 0, 100);
        var size = parseInt(cstr(header, 124, 12).trim() || "0", 8);
        var type = String.fromCharCode(header[156] || 48);
        var prefix = cstr(header, 345, 155);
        var data = buf.slice(pos + 512, pos + 512 + size);
        pos += 512 + Math.ceil(size / 512) * 512;
        if (type === "L") { longName = cstr(data, 0, data.length); continue; }   // GNU long name
        if (type === "x" || type === "g") { continue; }                          // pax headers
        if (longName !== null) { name = longName; longName = null; }
        else if (prefix) { name = prefix + "/" + name; }
        entries.push({
            name: name,
            mode: parseInt(cstr(header, 100, 8).trim() || "0", 8),
            uid: parseInt(cstr(header, 108, 8).trim() || "0", 8),
            gid: parseInt(cstr(header, 116, 8).trim() || "0", 8),
            mtime: parseInt(cstr(header, 136, 12).trim() || "0", 8),
            type: type === "\0" ? "0" : type,
            linkname: cstr(header, 157, 100),
            data: data
        });
    }
    return entries;
}

function octal(num, len) {
    var s = Math.floor(num).toString(8);
    while (s.length < len - 1) { s = "0" + s; }
    return s + "\0";
}

function writeTar(entries) {
    var parts = [];
    entries.forEach(function (e) {
        var header = Buffer.alloc(512, 0);
        var name = e.name;
        var prefix = "";
        if (Buffer.byteLength(name) > 100) {          // split into prefix + name
            var cut = name.lastIndexOf("/", 100 + 155);
            while (cut > 0 && (Buffer.byteLength(name.slice(cut + 1)) > 100)) {
                cut = name.lastIndexOf("/", cut - 1);
            }
            if (cut <= 0) { throw new Error("tar path too long: " + name); }
            prefix = name.slice(0, cut);
            name = name.slice(cut + 1);
        }
        header.write(name, 0, 100, "utf8");
        header.write(octal(e.mode, 8), 100, 8, "latin1");
        header.write(octal(e.uid || 0, 8), 108, 8, "latin1");
        header.write(octal(e.gid || 0, 8), 116, 8, "latin1");
        var data = e.data || Buffer.alloc(0);
        header.write(octal(e.type === "5" ? 0 : data.length, 12), 124, 12, "latin1");
        header.write(octal(e.mtime || 0, 12), 136, 12, "latin1");
        header.write("        ", 148, 8, "latin1");            // checksum placeholder
        header.write(e.type || "0", 156, 1, "latin1");
        if (e.linkname) { header.write(e.linkname, 157, 100, "utf8"); }
        header.write("ustar\0" + "00", 257, 8, "latin1");
        header.write("root", 265, 32, "utf8");
        header.write("root", 297, 32, "utf8");
        if (prefix) { header.write(prefix, 345, 155, "utf8"); }
        var sum = 0;
        for (var i = 0; i < 512; i++) { sum += header[i]; }
        header.write(octal(sum, 7) + " ", 148, 8, "latin1");
        parts.push(header);
        if (e.type !== "5" && data.length) {
            parts.push(data);
            var padLen = (512 - (data.length % 512)) % 512;
            if (padLen) { parts.push(Buffer.alloc(padLen, 0)); }
        }
    });
    parts.push(Buffer.alloc(1024, 0));   // end-of-archive marker
    return Buffer.concat(parts);
}

// ------------------------------------------------------------ helpers ---------

function readTarGz(buf) { return readTar(zlib.gunzipSync(buf)); }
function writeTarGz(entries) { return zlib.gzipSync(writeTar(entries), { level: 9 }); }

module.exports = {
    readAr: readAr, writeAr: writeAr,
    readTar: readTar, writeTar: writeTar,
    readTarGz: readTarGz, writeTarGz: writeTarGz,
    readIpk: function (file) { return readAr(fs.readFileSync(file)); }
};

// ------------------------------------------------------- command line ---------

if (require.main === module) {
    var cmd = process.argv[2];
    var file = process.argv[3];
    if (cmd !== "list" || !file) {
        console.error("usage: node tools/ipk.js list <file.ipk>");
        process.exit(1);
    }
    var members = module.exports.readIpk(file);
    members.forEach(function (m) {
        console.log("== " + m.name + "  (" + m.data.length + " bytes)");
        if (/\.tar\.gz$/.test(m.name)) {
            var entries = readTarGz(m.data);
            var shown = 0;
            entries.forEach(function (e) {
                if (m.name === "data.tar.gz" && shown >= 14) { return; }
                shown++;
                console.log("   " + (e.mode & 0o777).toString(8) + "  " + e.type + "  " + e.name + "  (" + e.data.length + ")");
            });
            if (m.name === "data.tar.gz") { console.log("   ... " + entries.length + " entries in total"); }
        } else {
            console.log("   " + JSON.stringify(m.data.toString("latin1").slice(0, 200)));
        }
    });
}
