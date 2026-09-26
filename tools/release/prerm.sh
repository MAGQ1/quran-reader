#!/bin/sh
#
# prerm -- runs as root before the app is removed (and by Preware during an update,
# which removes and then reinstalls). Keep this minimal: a stored copy of this
# script runs at the NEXT removal, so a bug here would be hard to repair later.

cd /

APP_ID="@APP_ID@"
DST="/usr/share/fonts/QuranShaped.ttf"
SVC="@SERVICE_ID@"

# Unregister the recitation fetch service (fixed, absolute paths only).
rm -f "/var/palm/ls2/services/pub/$SVC" "/var/palm/ls2/services/prv/$SVC" \
      "/var/palm/ls2/roles/pub/$SVC.json" "/var/palm/ls2/roles/prv/$SVC.json"
PID=`ps ax | grep "$SVC" | grep -v grep | awk '{print $1}'`
[ -n "$PID" ] && kill -9 $PID 2>/dev/null
# The service's jail keeps a bind mount of its folder, which goes stale when that folder is
# removed (and a reinstall then fails to start the service). One fixed path, lazy, no rm.
umount -l "/var/palm/jail/$SVC/media/cryptofs/apps/usr/palm/services/$SVC" 2>/dev/null
rm -f /media/internal/.quranaudio_*.mp3 /media/internal/.quranaudio_*.mp3.part
ls-control scan-services >/dev/null 2>&1   # so the Luna hub forgets the service now, not at next boot

echo "$APP_ID: removing the Arabic font..."

# Only ever remove the one file this app installed. The path is absolute and fixed.
if [ -f "$DST" ]; then
    rm -f "$DST"
    fc-cache -f /usr/share/fonts 2>/dev/null
fi

exit 0
