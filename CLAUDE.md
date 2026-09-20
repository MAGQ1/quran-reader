# Quran Reader — webOS Project

This is a **Palm/HP webOS** application (original 2009–2012 platform, not LG webOS).

## Session Setup

At the start of every session, load the full webOS platform context:

```
webos://knowledge/all
```

This gives you knowledge of the Mojo/Enyo frameworks, Luna service bus, SDK tools (including novacom), app structure conventions, and common gotchas — so we don't have to re-establish basics each time.

Note: the bundle is ~555 KB, too big to read in one go. It gets saved to a file; read individual topics instead (e.g. `webos://knowledge/enyo`, `.../gotchas`, `.../sdk-tools`).

---

## Project Details

**App ID:** `com.webosquran.reader` (placeholder name/ID — can be changed while nothing is installed on a device yet)
**Framework:** Enyo 1 (the version built into the TouchPad; no build step). Not Enyo 2.
**Target devices:** TouchPad
**webOS version(s):** 3.0.5+

## App Structure

A basic Quran reading app. The user can search surahs and browse by juz, read Arabic with an English translation side by side, and their reading position is saved. Recitation playback may come later.

The user picks the **Arabic script** and **English translation** from the app's top drop-down menu. Currently offered: Uthmani script and Sahih International (Saheeh International). Choices are saved.

Code rules: ES5 only in the app (`var`, no arrow functions/`let`/`const`/template strings) — the TouchPad's browser is from 2011. Every new JS file must be added to `depends.js` or it silently won't load.

Key files (app folder is `com.webosquran.reader/`):
- `appinfo.json` — app manifest
- `index.html` — entry page; starts `QuranApp`
- `depends.js` — list of files to load, in order
- `source/App.js` — root kind: two screens (home, reader), top menu, saving of choices/position
- `source/Home.js` — surah/juz list with search and "Continue reading"
- `source/Reader.js` — shows one surah; reports the top verse so progress is saved
- `source/Sources.js` — the list of scripts/translations offered; **add a new option here**
- `source/Prefs.js` — saved settings (localStorage, wrapped in try/catch)
- `source/QuranData.js` — loads the bundled JSON files
- `data/` — generated Quran text (per-surah JSON), do not edit by hand
- `fonts/` — Amiri Quran font + its OFL license
- `CREDITS.txt` — text/translation/font attribution (keep in sync with the About dialog)

Outside the app folder (not packaged onto the device):
- `tools/build-data.js` — downloads the texts and regenerates `data/` (`node tools/build-data.js`), with sanity checks (114 surahs, 6236 verses, 30 juz)
- `tools/make-icons.js` — generates the two icons

Data notes: the source glues the Bismillah onto verse 1 of 112 surahs; the build script strips it and stores a per-surah `bismillah` flag in `data/surahs.json`, and the reader shows it as a header. Surahs 1 and 9 have no header.

## Services

None. Everything is bundled and works offline. Add a service only if a real need appears (e.g. recitation download).

## Development Notes

The user has not coded before, so guide them step by step and explain what commands do. The app should be simple but rock-solid: handle missing/corrupt saved settings by falling back to defaults, never crash on a storage or load error.

Status: first version written but **not yet run on a device or emulator** (SDK not installed on this PC when written). The Enyo 1 UI code (kind names, menu/submenu syntax, `VirtualList`, `Pane`) was written from memory of the Enyo 1 API and needs to be verified on a device/emulator. Plain logic is covered by stubbed tests.

Licensing to double-check before any public release: Tanzil text terms (attribution, no changes to the text), and Saheeh International translation terms.

## Useful Commands

```bash
# Regenerate the Quran data files (needs internet, Node)
node tools/build-data.js

# Package and install (needs the webOS SDK)
palm-package com.webosquran.reader/ && palm-install com.webosquran.reader_*.ipk

# Launch and watch logs
palm-launch com.webosquran.reader && palm-log -f com.webosquran.reader

# Quick file push (during active development)
novacom put file:///media/cryptofs/apps/usr/palm/applications/com.webosquran.reader/source/Reader.js \
  < com.webosquran.reader/source/Reader.js
```
