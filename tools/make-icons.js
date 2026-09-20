// Generates the app icons: an open book with a gold crescent and star, on green.
//
//   node tools/make-icons.js
//
// Writes com.magq.quranreader/images/icon.png (64x64) and miniicon.png (48x48), and
// store/icon-256.png (a larger copy for the App Museum listing; not part of the app).
// Everything is drawn from shapes with 4x4 anti-aliasing, so there are no image
// files to edit and no libraries to install.

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var APP_IMAGES = path.join(ROOT, 'com.magq.quranreader', 'images');
var STORE = path.join(ROOT, 'store');

// ---- colours ---------------------------------------------------------------
var GREEN_TOP = [24, 104, 66], GREEN_BOTTOM = [12, 72, 44];
var GOLD = [247, 201, 72];
var COVER = [176, 128, 46];          // book cover edge
var PAGE = [252, 246, 226];          // pages
var PAGE_SHADE = [226, 216, 186];    // page lines and the fold

// ---- geometry, in a 0..1 square -------------------------------------------
function mirror(pts) { return pts.map(function (p) { return [1 - p[0], p[1]]; }); }

// Left half of the open book (the right half is its mirror image).
var COVER_L = [[0.500, 0.590], [0.300, 0.500], [0.120, 0.520], [0.120, 0.845], [0.300, 0.825], [0.500, 0.915]];
var PAGE_L = [[0.500, 0.605], [0.305, 0.520], [0.150, 0.540], [0.150, 0.800], [0.305, 0.790], [0.500, 0.880]];
var COVER_R = mirror(COVER_L), PAGE_R = mirror(PAGE_L);

// Faint lines of text on the pages. Each line runs between the page's top and bottom edges
// at a fixed fraction of the way down, so it bends exactly the way the page bends.
var PAGE_TOP = [[0.150, 0.540], [0.305, 0.520], [0.500, 0.605]];
var PAGE_BOTTOM = [[0.150, 0.800], [0.305, 0.790], [0.500, 0.880]];

function yOnEdge(edge, x) {   // height of a polyline edge at a given x
    for (var i = 0; i < edge.length - 1; i++) {
        if (x >= edge[i][0] && x <= edge[i + 1][0]) {
            var t = (x - edge[i][0]) / (edge[i + 1][0] - edge[i][0]);
            return edge[i][1] + (edge[i + 1][1] - edge[i][1]) * t;
        }
    }
    return edge[edge.length - 1][1];
}

var LINES = [];   // short straight pieces; together they make each bent line
[0.25, 0.47, 0.69].forEach(function (frac) {
    var xs = [0.195, 0.305, 0.455];   // start, the crest of the page, end
    for (var i = 0; i < xs.length - 1; i++) {
        var y0 = yOnEdge(PAGE_TOP, xs[i]), y1 = yOnEdge(PAGE_TOP, xs[i + 1]);
        var b0 = yOnEdge(PAGE_BOTTOM, xs[i]), b1 = yOnEdge(PAGE_BOTTOM, xs[i + 1]);
        LINES.push([[xs[i], y0 + (b0 - y0) * frac], [xs[i + 1], y1 + (b1 - y1) * frac]]);
    }
});

var STAR = [];
(function () {
    var cx = 0.605, cy = 0.262, outer = 0.062, inner = 0.026;
    for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var r = (i % 2 === 0) ? outer : inner;
        STAR.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
})();

function inPoly(pts, x, y) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) { inside = !inside; }
    }
    return inside;
}

function nearLine(a, b, x, y, halfWidth) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    var px = a[0] + t * dx - x, py = a[1] + t * dy - y;
    return px * px + py * py <= halfWidth * halfWidth;
}

function mix(c1, c2, t) { return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t]; }

// The colour at one point of the icon, or null outside the rounded square.
function colourAt(x, y) {
    var corner = 0.18;
    var dx = Math.max(corner - x, 0, x - (1 - corner));
    var dy = Math.max(corner - y, 0, y - (1 - corner));
    if (dx * dx + dy * dy > corner * corner) { return null; }

    var col = mix(GREEN_TOP, GREEN_BOTTOM, y);

    if (inPoly(COVER_L, x, y) || inPoly(COVER_R, x, y)) { col = COVER; }
    if (inPoly(PAGE_L, x, y) || inPoly(PAGE_R, x, y)) {
        col = PAGE;
        // the fold in the middle, and a few faint lines of text
        if (Math.abs(x - 0.5) < 0.010) { col = PAGE_SHADE; }
        for (var i = 0; i < LINES.length; i++) {
            if (nearLine(LINES[i][0], LINES[i][1], x, y, 0.0075) ||
                nearLine([1 - LINES[i][0][0], LINES[i][0][1]], [1 - LINES[i][1][0], LINES[i][1][1]], x, y, 0.0075)) {
                col = PAGE_SHADE;
            }
        }
    }

    // crescent opening to the right, with the star in its opening
    var inMoon = Math.pow(x - 0.455, 2) + Math.pow(y - 0.265, 2) <= 0.165 * 0.165;
    var inCut = Math.pow(x - 0.545, 2) + Math.pow(y - 0.245, 2) <= 0.140 * 0.140;
    if ((inMoon && !inCut) || inPoly(STAR, x, y)) { col = GOLD; }
    return col;
}

// ---- PNG output -------------------------------------------------------------
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

var SS = 4;   // 4x4 samples per pixel

function png(size) {
    var stride = size * 4 + 1;
    var raw = Buffer.alloc(stride * size);
    for (var y = 0; y < size; y++) {
        raw[y * stride] = 0;   // filter type: none
        for (var x = 0; x < size; x++) {
            var r = 0, g = 0, b = 0, covered = 0;
            for (var sy = 0; sy < SS; sy++) {
                for (var sx = 0; sx < SS; sx++) {
                    var col = colourAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
                    if (col) { r += col[0]; g += col[1]; b += col[2]; covered++; }
                }
            }
            var o = y * stride + 1 + x * 4;
            if (covered) {
                raw[o] = Math.round(r / covered); raw[o + 1] = Math.round(g / covered); raw[o + 2] = Math.round(b / covered);
            }
            raw[o + 3] = Math.round(255 * covered / (SS * SS));
        }
    }
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

fs.mkdirSync(APP_IMAGES, { recursive: true });
fs.mkdirSync(STORE, { recursive: true });
fs.writeFileSync(path.join(APP_IMAGES, 'icon.png'), png(64));
fs.writeFileSync(path.join(APP_IMAGES, 'miniicon.png'), png(48));
fs.writeFileSync(path.join(STORE, 'icon-256.png'), png(256));
console.log('Wrote images/icon.png (64x64), images/miniicon.png (48x48) and store/icon-256.png (256x256)');
