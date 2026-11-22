<img src="store/icon-256.png" alt="Quran Reader icon" width="96" align="right">

# Quran Reader

A free Quran reader for the **HP TouchPad** (Palm/HP webOS 3.0.5 and later, including webOS CE 3.1.0). It shows the Arabic with an English translation, and can recite verse by verse.

It is built with Enyo 1, the framework that comes with the TouchPad. This is the original Palm/HP webOS, not LG's webOS.

All praise is due to Allah, the Most High.

## Features

**Reading**
- The Arabic in the **Uthmani** script or the **Simple (Imla'ei)** spelling, with all vowel marks and stop signs, joined and laid out properly on the TouchPad
- An English translation under each verse: **Talal Itani** (ClearQuran, the default) or **Marmaduke Pickthall**
- An optional transliteration line
- Arabic-style or regular verse numbers, and a light or dark theme
- Your reading position is saved, so "Continue reading" takes you back to it
- Bookmarks, toggled with the ribbon beside any verse

**Listening**
- Verse-by-verse recitation by Mishary Alafasy, Mahmoud Khalil Al-Husary or Abdul Basit Abdul Samad (Murattal). The verse being recited is highlighted.
- Play one verse, or play continuously from any verse, with an optional pause between verses
- A card in the notification area while a recitation plays: Previous surah, Play/Pause and Next surah, which also work from the lock screen

**Finding your way**
- Browse the 114 surahs or the 30 juz, and search surahs by name or number
- **Just Type**: type a surah's name in the launcher to open it. Turn it on in Settings → Just Type.
- An update check against App Museum II

The text and translations are bundled, so reading works offline. Recitation needs an internet connection.

## Installing

Get it from **App Museum II**, or download the `.ipk` from [Releases](https://github.com/MAGQ1/quran-reader/releases).

**Install it with Preware or WebOS Quick Install, not `palm-install`.** The package's install script runs as root to install the Arabic font system-wide and register the recitation service. `palm-install` doesn't run that script, and the Arabic then shows as empty boxes.

After the first install, or an update that changes the font, restart the TouchPad once (a full restart or a Luna restart). The app reminds you when this is needed.

## Why the Arabic needs special handling

The TouchPad's browser can't draw Arabic properly:
- it ignores web fonts
- it has no Arabic font of its own
- it doesn't join letters or position vowel marks

So `tools/shape-arabic.py` does all of that on a PC instead. It lays out every word with HarfBuzz and the Amiri Quran font. Each joined letter, with its marks, becomes a single glyph in a small generated font called **Quran Shaped**, and the app displays that pre-joined text.

The original Unicode text is kept unchanged alongside it, so it can be searched.

## Repository layout

| Path | What it is |
| --- | --- |
| `com.magq.quranreader/` | The app: `source/` (Enyo kinds), `dashboard/` (the recitation card), `data/` (generated text, don't edit by hand), `fonts/` |
| `com.magq.quranreader.service/` | A small Node service that downloads each verse's audio to the device, so it plays from a local file |
| `com.magq.quranreader.package/` | Ties the app and service into one package |
| `tools/` | Data download, Arabic shaping, icon and release-build scripts |
| `store/` | App Museum listing text and icons |

## Building

You need Node.js. To rebuild the font, you also need Python (`pip install -r tools/requirements.txt`).

```sh
node tools/build-data.js      # download the texts and regenerate data/
node tools/fetch-itani.js     # Talal Itani's translation, from clearquran.com
python tools/shape-arabic.py  # pre-join the Arabic and build QuranShaped.ttf
node tools/build-release.js   # build dist/com.magq.quranreader_<version>_all.ipk
```

For development on a TouchPad with the webOS SDK, `tools/install-ce.ps1` installs, registers the service and launches the app (it also works on webOS CE). `tools/install-font.ps1` puts the font on the device.

## Credits and licences

The app is free and non-commercial.

- **Arabic text:** [Tanzil Project](https://tanzil.net), Uthmani and Simple 1.1, CC BY 3.0, used unchanged
- **Translations:** Translation by Talal Itani, [ClearQuran.com](https://www.clearquran.com) (CC BY-ND 4.0); *The Meaning of the Glorious Koran* by Marmaduke Pickthall (public domain)
- **Transliteration:** Tanzil Project's English Transliteration (non-commercial use)
- **Recitation audio:** courtesy of [EveryAyah.com](https://everyayah.com) and VerseByVerseQuran.com. Fetched on demand; not included in this repository.
- **Font:** [Amiri Quran](https://github.com/aliftype/amiri) (SIL OFL 1.1), modified as "Quran Shaped" under the same licence
- **Update checker:** a modified copy of Updater Helper from [webos-common](https://github.com/webOSArchive/webos-common) (MIT)
- **The app's own code:** MIT License, Copyright (c) 2026 MAGQ. See [LICENSE](LICENSE).

Full details are in [CREDITS.txt](com.magq.quranreader/CREDITS.txt). The bundled texts, translations and font keep their own licences; the MIT licence covers only the app's code.

Any errors in displaying the Quran were made by accident. Please contact MAGQ on the webOS Archive server if you find any. May Allah forgive those mistakes.
