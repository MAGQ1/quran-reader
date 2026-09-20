#!/bin/sh
#
# postinst -- runs as root (via Preware / WebOS Quick Install) after the app is
# installed. palm-install does NOT run this, so a palm-install'ed copy has no font.
#
# What it does: puts the Arabic font where the TouchPad's text engine can find it.
# The TouchPad browser ignores fonts shipped inside an app, so it has to be a
# system font. Everything else in the app works without root.
#
# It never restarts Luna: Preware itself runs inside Luna, so a restart here would
# abort the rest of the install. The font shows up after the next Luna restart or
# reboot (the app detects a missing font and tells the user).

cd /

APP_ID="@APP_ID@"
SRC="/media/cryptofs/apps/usr/palm/applications/$APP_ID/fonts/QuranShaped.ttf"
DST="/usr/share/fonts/QuranShaped.ttf"

echo "$APP_ID: installing the Arabic font..."

if [ ! -f "$SRC" ]; then
    echo "$APP_ID: font file not found at $SRC - skipping"
    exit 0    # do not fail the whole install over the font
fi

# The root filesystem is normally writable already; this is a harmless safety net.
mount -o remount,rw / 2>/dev/null

if cmp -s "$SRC" "$DST" 2>/dev/null; then
    echo "$APP_ID: font already up to date"
else
    # Write beside the target, then rename. Every process that draws text has the
    # old font mapped into memory; copying over it in place can crash them (SIGBUS).
    # A rename swaps the file atomically and the old copy stays valid for them.
    TMP="$DST.tmp.$$"
    if cp "$SRC" "$TMP" && chmod 644 "$TMP" && mv -f "$TMP" "$DST"; then
        echo "$APP_ID: font installed"
    else
        rm -f "$TMP"
        echo "$APP_ID: could not install the font"
        exit 1
    fi
fi

fc-cache -f /usr/share/fonts 2>/dev/null

echo "$APP_ID: done. Restart the TouchPad once so the new font is picked up."
exit 0
