#!/bin/sh
#
# prerm -- runs as root before the app is removed (and by Preware during an update,
# which removes and then reinstalls). Keep this minimal: a stored copy of this
# script runs at the NEXT removal, so a bug here would be hard to repair later.

cd /

APP_ID="@APP_ID@"
DST="/usr/share/fonts/QuranShaped.ttf"

echo "$APP_ID: removing the Arabic font..."

# Only ever remove the one file this app installed. The path is absolute and fixed.
if [ -f "$DST" ]; then
    rm -f "$DST"
    fc-cache -f /usr/share/fonts 2>/dev/null
fi

exit 0
