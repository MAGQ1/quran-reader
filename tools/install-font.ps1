# install-font.ps1 -- put the "Quran Shaped" font on a USB-connected TouchPad.
#
# The TouchPad's browser ignores fonts shipped inside an app, so the Arabic
# font has to live in the system font folder instead. Run this once per device
# (and again whenever tools/shape-arabic.py has produced a new font).
#
#   powershell -ExecutionPolicy Bypass -File tools\install-font.ps1 -RestartLuna
#
# -RestartLuna  restart the webOS interface afterwards. Needed the first time,
#               because the device only notices new fonts when Luna restarts.
#               It closes any open apps for a few seconds.
# -Remove       list of old font file names to delete first, e.g. leftovers
#               from experiments:  -Remove AQ-A.ttf,AQ-B.ttf
#
# Needs the webOS SDK (novacom) on the PATH and the TouchPad in Developer Mode.

param(
    [switch]$RestartLuna,
    [string[]]$Remove = @()
)

$ErrorActionPreference = "Stop"
$font = Join-Path $PSScriptRoot "..\com.webosquran.reader\fonts\QuranShaped.ttf"
if (-not (Test-Path $font)) {
    throw "QuranShaped.ttf not found. Run tools\shape-arabic.py first."
}
$font = (Resolve-Path $font).Path
$target = "/usr/share/fonts/QuranShaped.ttf"

# "-Remove a.ttf,b.ttf" arrives as ONE string when run via "powershell -File".
foreach ($name in ($Remove | ForEach-Object { $_ -split "," } | Where-Object { $_ })) {
    Write-Host "Removing old font $name"
    novacom run file:///bin/rm -- -f "/usr/share/fonts/$name"
}

Write-Host "Copying font to the TouchPad..."
cmd /c "novacom put file://$target < `"$font`""
novacom run file:///bin/chmod -- 644 $target
novacom run file:///bin/ls -- -l $target

Write-Host "Refreshing the font cache..."
novacom run file:///usr/bin/fc-cache -- -f /usr/share/fonts | Out-Null

if ($RestartLuna) {
    Write-Host "Restarting Luna (open apps will close for a few seconds)..."
    $script = Join-Path $env:TEMP "restartluna.sh"
    [IO.File]::WriteAllText($script, "#!/bin/sh`nstop LunaSysMgr`nsleep 2`nstart LunaSysMgr`n")
    cmd /c "novacom put file:///tmp/restartluna.sh < `"$script`""
    novacom run file:///bin/sh -- /tmp/restartluna.sh | Out-Null
    Write-Host "Done. Wait for the TouchPad to finish starting, then open the app."
} else {
    Write-Host "Done. Restart Luna (or reboot) before the new font shows up."
}
