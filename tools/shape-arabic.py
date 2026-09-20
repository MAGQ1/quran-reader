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
  3. Writes each verse as a string of those characters (word by word, each
     word left-to-right as it is drawn; spaces between words are kept, each
     preceded by an invisible right-to-left mark so the words flow from the
     right -- see RLM below).

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

import uharfbuzz as hb
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

# Invisible right-to-left mark, put after every word. Without it the device
# treats our characters as left-to-right text and the spaces between them as
# left-to-right too, so a verse would read from the left. With it, each space
# counts as right-to-left and the words run from the right (the letters inside
# each word stay as drawn). The font carries it as an empty glyph.
RLM = "‏"
KEEP_CHARS.append(ord(RLM))


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
        last = None
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            if info.codepoint == 0:
                self.notdef_hits += 1
            item = (info.codepoint, pos.x_offset, pos.y_offset, pos.x_advance)
            if groups and info.cluster == last:
                groups[-1].append(item)
            else:
                groups.append([item])
            last = info.cluster
        out = []
        for g in groups:
            key = tuple(g)
            cp = self.clusters.get(key)
            if cp is None:
                cp = PUA_START + len(self.keys)
                if cp > PUA_END:
                    sys.exit("Ran out of private-use characters")
                self.clusters[key] = cp
                self.keys.append(key)
            out.append(chr(cp))
        return "".join(out)

    def text(self, text):
        # Keep the words in the same order and the spaces where they were.
        # The mark goes BEFORE each space, so splitting on " " still gives
        # exactly the same number of words as the plain text.
        return (RLM + " ").join(self.word(w) if w else "" for w in text.split(" "))

    def build_font(self, out_path):
        tt = self.tt
        glyf = tt["glyf"]
        hmtx = tt["hmtx"]
        order = self.order
        for n, key in enumerate(self.keys):
            name = "shaped%05d" % n
            pen = TTGlyphPen(self.glyphset)
            pen_x = 0
            for gid, xoff, yoff, xadv in key:
                comp = TransformPen(pen, (1, 0, 0, 1, pen_x + xoff, yoff))
                self.glyphset[order[gid]].draw(comp)
                pen_x += xadv
            glyph = pen.glyph()
            order.append(name)
            glyf.glyphs[name] = glyph
            hmtx.metrics[name] = (max(pen_x, 0), 0)
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
    samples = [(1, 0), (1, 1), (2, 255), (112, 0), (36, 0)]
    rows = []
    for surah, idx in samples:
        with open(os.path.join(shaped_dir, "%03d.json" % surah), encoding="utf-8") as f:
            verse = json.load(f)[idx]
        # Words are stored one by one; the first word belongs on the RIGHT.
        rows.append(" ".join(reversed(verse.split(" "))))
    width = 1500
    img = Image.new("RGB", (width, 110 * len(rows) + 20), "white")
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(rows):
        w = draw.textlength(line, font=font)
        draw.text((max(width - w - 20, 10), 20 + i * 110), line, font=font, fill="black")
    img.save(os.path.join(folder, "preview.png"))


if __name__ == "__main__":
    main()
