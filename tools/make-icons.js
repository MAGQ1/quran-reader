// Generates the two app icons (a white crescent on green) as PNG files.
// Only needs to be run once:  node tools/make-icons.js

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var OUT = path.join(__dirname, '..', 'com.webosquran.reader', 'images');

// CRC32, required by the PNG format.
var crcTable = [];
for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    crcTable[n] = c >>> 0;
}
function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) { c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function png(size) {
    var green = [30, 110, 70], white = [255, 255, 255];
    var r = size * 0.30;                       // outer circle radius
    var cx = size * 0.46, cy = size * 0.5;     // outer circle centre
    var cutX = size * 0.58;                    // cut-out circle centre (makes the crescent)
    var corner = size * 0.18;                  // rounded corners
    var raw = Buffer.alloc((size * 4 + 1) * size);
    for (var y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0;           // filter type: none
        for (var x = 0; x < size; x++) {
            var px = x + 0.5, py = y + 0.5;
            // rounded-square mask
            var dx = Math.max(corner - px, 0, px - (size - corner));
            var dy = Math.max(corner - py, 0, py - (size - corner));
            var inside = (dx * dx + dy * dy) <= corner * corner;
            var inOuter = Math.pow(px - cx, 2) + Math.pow(py - cy, 2) <= r * r;
            var inCut = Math.pow(px - cutX, 2) + Math.pow(py - cy, 2) <= r * r * 0.8;
            var col = (inOuter && !inCut) ? white : green;
            var o = y * (size * 4 + 1) + 1 + x * 4;
            raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = inside ? 255 : 0;
        }
    }
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), png(64));
fs.writeFileSync(path.join(OUT, 'miniicon.png'), png(48));
console.log('Wrote icon.png (64x64) and miniicon.png (48x48)');
