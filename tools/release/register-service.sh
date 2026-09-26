#!/bin/sh
#
# Registers the recitation fetch service (@SERVICE_ID@) on the Luna (LS2) bus.
#
# Copying the service's files into place is NOT enough: without an explicit LS2
# registration, palm://@SERVICE_ID@/ calls fail with "Service does not exist".
# webOS wipes these /var/palm/ls2 files on every (re)install, so this has to run
# every time. It runs from two places, both as root:
#   - tools/release/postinst.sh (build-release.js pastes this file's body in), and
#   - tools/install-ce.ps1 for development installs (ipkg's offline install does
#     not run postinst scripts).
# Same approach as SoundCloud Player's postinst.

SVC="@SERVICE_ID@"
DIR="/media/cryptofs/apps/usr/palm/services/$SVC"

mount -o remount,rw / 2>/dev/null

cat > "/var/palm/ls2/services/pub/$SVC" <<INNER
[D-BUS Service]
Name=$SVC
Exec=/usr/bin/run-js-service -n $DIR
INNER
cp "/var/palm/ls2/services/pub/$SVC" "/var/palm/ls2/services/prv/$SVC"

cat > "/var/palm/ls2/roles/pub/$SVC.json" <<JSON
{ "role": { "exeName":"js", "type":"regular", "allowedNames":["$SVC"] },
  "permissions": [ { "service":"$SVC", "inbound":["*"], "outbound":["*"] } ] }
JSON
sed 's/"outbound":\["\*"\]/"outbound":[]/' "/var/palm/ls2/roles/pub/$SVC.json" > "/var/palm/ls2/roles/prv/$SVC.json"

# Don't let an old instance keep serving stale code after an upgrade.
PID=`ps ax | grep "$SVC" | grep -v grep | awk '{print $1}'`
[ -n "$PID" ] && kill -9 $PID 2>/dev/null

# The service runs in a jail the system builds on first use and KEEPS (it lives under
# /var/palm/jail/$SVC, with a bind mount of the service's own folder). An update removes and
# recreates that folder, so the mount goes stale ("... (deleted)") and the jailer then fails
# with "failed to mount directory ... No such file or directory" -- the service never starts
# until a reboot. Unmounting just that one mount lets the jailer mount the new folder next
# time. Lazy (-l), one fixed path, and NOT rm: the same jail has /media/internal mounted.
umount -l "/var/palm/jail/$SVC/media/cryptofs/apps/usr/palm/services/$SVC" 2>/dev/null

ls-control scan-services >/dev/null 2>&1
