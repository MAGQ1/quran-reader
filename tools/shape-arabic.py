"""
shape-arabic.py -- pre-shape the Arabic text for the TouchPad.

WHY: the TouchPad's 2011 text engine cannot join Arabic letters or place
vowel marks (it draws every letter on its own, and ignores web fonts). So we
do the Arabic layout here, on the PC, with HarfBuzz, and give the device
something it can draw: plain characters.

WHAT IT DOES
  1. Lays out every word of the Arabic text with HarfBuzz + Amiri Quran.
  2. Each joined letter (together with its vowel marks) becomes ONE new glyph
     in a small custom font, "Quran Shaped", assigned a private-use character.
  3. Writes each verse as a string of those characters in normal reading
     order (first letter first, spaces between words kept). The app draws it
     right to left with CSS `unicode-bidi: bidi-override; direction: rtl`,
     because the device cannot order Arabic text itself.

The original Unicode text in data/uthmani/ is NOT changed and stays the source
for search. The shaped copy has the SAME number of words in the SAME order, so
word N of the shaped text is word N of the plain text (handy for highlighting
search hits).

OUTPUT (inside com.webosquran.reader/)
  fonts/QuranShaped.ttf          the custom font (install it on the device)
  data/uthmani-shaped/NNN.json   shaped verses, one file per surah
  data/shaped-extra.json         shaped surah names + bismillah

USAGE
  python tools/shape-arabic.py
  needs:  pip install fonttools uharfbuzz   (pillow only for --preview)
"""
import argparse
import glob
import json
import os
import sys
import unicodedata

import uharfbuzz as hb
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "com.webosquran.reader")
SOURCE_FONT = os.path.join(APP, "fonts", "AmiriQuran-Regular.ttf")
FAMILY = "Quran Shaped"
PUA_START = 0xE000
PUA_END = 0xF8FF  # end of the Basic Multilingual Plane private-use area

# Characters the app itself draws around the verses: verse-number brackets and
# digits in both styles (Arabic-Indic and regular 0-9). They need no joining,
# so they stay ordinary characters.
KEEP_CHARS = [0x20, 0xFD3E, 0xFD3F] + list(range(0x0660, 0x066A)) + list(range(0x30, 0x3A))

# Extra space (font units, 1000 = one em) put after a letter that does NOT connect
# to the next letter of the same word (after ا د ذ ر ز و ة ...). The font spaces
# such letters tightly; on a small screen they looked crowded.
NONJOIN_GAP = 60

# Stand-alone stop signs (the small jeem, sad-lam-alef ...) are drawn very high
# above the line in the original font (1.3 to 1.8 em). Lower them by this much so
# they do not reach into the line above.
SIGN_DROP = 300

# ... and move them this far toward the NEXT word (left on screen). In the original
# they lean over the last letter of the word before, right on top of its vowel mark.
SIGN_SHIFT = 220

# Arabic letters that join only to the letter BEFORE them (never to the next one).
RIGHT_JOINING = set([0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062F, 0x0630,
                    0x0631, 0x0632, 0x0648, 0x0671, 0x0672, 0x0673, 0x0675, 0x0676,
                    0x0677, 0x06C0, 0x06D2, 0x06D3, 0x06D5] +
                   list(range(0x0688, 0x069A)) + list(range(0x06C3, 0x06CC)))


def join_type(ch):
    """D = joins both sides, R = joins only the letter before it, U = joins neither."""
    cp = ord(ch)
    if cp == 0x0640:
        return "D"
    if cp == 0x0621:
        return "U"
    if cp in RIGHT_JOINING:
        return "R"
    return "D"


def is_letter(ch):
    return unicodedata.category(ch) == "Lo"


def gap_after(word, start, end):
    """Extra advance for the cluster word[start:end], if it ends a joined run."""
    letters = [c for c in word[start:end] if is_letter(c)]
    if not letters:
        return 0
    nxt = None
    for c in word[end:]:
        if is_letter(c):
            nxt = c
            break
    if nxt is None:
        return 0   # last letter of the word: the space after it is enough
    if join_type(letters[-1]) == "D" and join_type(nxt) in ("D", "R"):
        return 0   # they connect
    return NONJOIN_GAP


class Shaper(object):
    def __init__(self, font_path):
        self.tt = TTFont(font_path)
        self.order = list(self.tt.getGlyphOrder())
        blob = hb.Blob.from_file_path(font_path)
        self.hbfont = hb.Font(hb.Face(blob))
        self.glyphset = self.tt.getGlyphSet()
        self.clusters = {}   # key -> private-use code point
        self.keys = []       # in creation order
        self.notdef_hits = 0

    def word(self, word):
        """Shape one word; return its string of private-use characters."""
        buf = hb.Buffer()
        buf.add_str(word)
        buf.direction = "rtl"
        buf.script = "Arab"
        buf.language = "ar"
        hb.shape(self.hbfont, buf, {})
        groups = []
        starts = []
        last = None
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            if info.codepoint == 0:
                self.notdef_hits += 1
            item = (info.codepoint, pos.x_offset, pos.y_offset, pos.x_advance)
            if groups and info.cluster == last:
                groups[-1].append(item)
            else:
                groups.append([item])
                starts.append(info.cluster)
            last = info.cluster
        bounds = sorted(set(starts)) + [len(word)]
        out = []
        for g, start in zip(groups, starts):
            end = bounds[bounds.index(start) + 1]
            key = (tuple(g), gap_after(word, start, end))
            cp = self.clusters.get(key)
            if cp is None:
                cp = PUA_START + len(self.keys)
                if cp > PUA_END:
                    sys.exit("Ran out of private-use characters")
                self.clusters[key] = cp
                self.keys.append(key)
            out.append(chr(cp))
        # HarfBuzz returns the glyphs left-to-right as drawn; store them in
        # reading order (right-to-left) instead -- the page reverses them again.
        out.reverse()
        return "".join(out)

    def hanging(self, marks):
        """Shape a stand-alone sign (e.g. the small jeem of a stop sign).

        Such a sign sits between two spaces in the text and belongs over the
        space before it. Shaped on its own it has nothing to attach to and lands
        in the wrong place, so shape it after a space, note where it ends up
        relative to that space, and store it alone with zero width. The space in
        front of it in the stored text then puts it in exactly the right spot.
        """
        buf = hb.Buffer()
        buf.add_str(" " + marks)
        buf.direction = "rtl"
        buf.script = "Arab"
        buf.language = "ar"
        hb.shape(self.hbfont, buf, {})
        space_gid = self.hbfont.get_nominal_glyph(0x20)
        pen = 0
        space_x = None
        found = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            if info.codepoint == 0:
                self.notdef_hits += 1
            if info.codepoint == space_gid and space_x is None:
                space_x = pen
            else:
                found.append((info.codepoint, pen + pos.x_offset, pos.y_offset))
            pen += pos.x_advance
        key = (tuple((gid, x - space_x - SIGN_SHIFT, y - SIGN_DROP, 0) for gid, x, y in found), 0)
        cp = self.clusters.get(key)
        if cp is None:
            cp = PUA_START + len(self.keys)
            if cp > PUA_END:
                sys.exit("Ran out of private-use characters")
            self.clusters[key] = cp
            self.keys.append(key)
        return chr(cp)

    def token(self, tok):
        if not tok:
            return ""
        if all(unicodedata.category(c) in ("Mn", "Me") for c in tok):
            return self.hanging(tok)
        return self.word(tok)

    def text(self, text):
        # Keep the words in the same order and the spaces where they were.
        return " ".join(self.token(t) for t in text.split(" "))

    def build_font(self, out_path):
        tt = self.tt
        glyf = tt["glyf"]
        hmtx = tt["hmtx"]
        order = self.order
        for n, (items, extra) in enumerate(self.keys):
            name = "shaped%05d" % n
            # Every glyph is a plain, self-contained outline (no references to
            # other glyphs): the simplest form for an old font engine.
            pen = TTGlyphPen(None)
            # The extra gap goes on the LEFT of the letter (the side the next letter
            # is on, since the text runs right to left).
            pen_x = extra
            for gid, xoff, yoff, xadv in items:
                rec = DecomposingRecordingPen(self.glyphset)
                self.glyphset[order[gid]].draw(rec)
                rec.replay(TransformPen(pen, (1, 0, 0, 1, pen_x + xoff, yoff)))
                pen_x += xadv
            glyph = pen.glyph()
            glyph.recalcBounds(glyf)
            order.append(name)
            glyf.glyphs[name] = glyph
            lsb = glyph.xMin if glyph.numberOfContours else 0
            hmtx.metrics[name] = (max(pen_x, 0), lsb)
        tt.setGlyphOrder(order)
        glyf.glyphOrder = order

        for table in tt["cmap"].tables:
            if table.isUnicode() and table.format in (4, 12):
                for n in range(len(self.keys)):
                    table.cmap[PUA_START + n] = "shaped%05d" % n

        for t in ("GSUB", "GPOS", "GDEF"):  # the device ignores them anyway
            if t in tt:
                del tt[t]

        for rec in tt["name"].names:
            if rec.nameID in (1, 4, 16):
                rec.string = FAMILY
            elif rec.nameID == 6:
                rec.string = FAMILY.replace(" ", "") + "-Regular"
            elif rec.nameID in (2, 17):
                rec.string = "Regular"

        # Keep the font's small hinting program (the `prep` table). Without ANY
        # hinting program FreeType silently switches to its automatic grid-fitter,
        # which on the TouchPad squashed letters and threw vowel marks away
        # from their letters.
        opts = Options()
        opts.layout_features = []
        opts.notdef_outline = True
        opts.glyph_names = False
        opts.name_IDs = ["*"]
        sub = Subsetter(opts)
        sub.populate(unicodes=KEEP_CHARS + [PUA_START + n for n in range(len(self.keys))])
        sub.subset(tt)
        tt.save(out_path)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="folder to write PNG previews into (needs pillow)")
    args = ap.parse_args()

    data = os.path.join(APP, "data")
    shaper = Shaper(SOURCE_FONT)

    out_dir = os.path.join(data, "uthmani-shaped")
    os.makedirs(out_dir, exist_ok=True)

    verses = 0
    for path in sorted(glob.glob(os.path.join(data, "uthmani", "*.json"))):
        with open(path, encoding="utf-8") as f:
            plain = json.load(f)
        shaped = [shaper.text(v) for v in plain]
        # Same words in the same order, or search-highlighting would break.
        for a, b in zip(plain, shaped):
            assert len(a.split(" ")) == len(b.split(" ")), "word count changed"
        write_json(os.path.join(out_dir, os.path.basename(path)), shaped)
        verses += len(shaped)

    with open(os.path.join(data, "surahs.json"), encoding="utf-8") as f:
        surahs = json.load(f)
    with open(os.path.join(data, "bismillah.json"), encoding="utf-8") as f:
        bismillah = json.load(f)
    write_json(os.path.join(data, "shaped-extra.json"), {
        "bismillah": shaper.text(bismillah["text"]),
        "names": [shaper.text(s["ar"]) for s in surahs],
    })

    font_path = os.path.join(APP, "fonts", "QuranShaped.ttf")
    shaper.build_font(font_path)

    print("verses shaped:            %d" % verses)
    print("custom glyphs created:    %d" % len(shaper.keys))
    print("missing-glyph hits:       %d (should be 0)" % shaper.notdef_hits)
    print("font size:                %d KB" % (os.path.getsize(font_path) // 1024))

    if args.preview:
        preview(font_path, out_dir, args.preview)


def preview(font_path, shaped_dir, folder):
    """Draw a few verses to PNG so the result can be checked by eye."""
    from PIL import Image, ImageDraw, ImageFont
    os.makedirs(folder, exist_ok=True)
    font = ImageFont.truetype(font_path, 54)
    samples = [(2, 254), (2, 255), (1, 1), (112, 0)]
    rows = []
    for surah, idx in samples:
        with open(os.path.join(shaped_dir, "%03d.json" % surah), encoding="utf-8") as f:
            verse = json.load(f)[idx]
        verse = " ".join(verse.split(" ")[:9])   # keep the picture a sensible width
        # Stored in reading order; reverse it to get what is drawn left to right.
        rows.append(verse[::-1])
    width = 1500
    img = Image.new("RGB", (width, 110 * len(rows) + 20), "white")
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(rows):
        w = draw.textlength(line, font=font)
        draw.text((max(width - w - 20, 10), 20 + i * 110), line, font=font, fill="black")
    img.save(os.path.join(folder, "preview.png"))


if __name__ == "__main__":
    main()
