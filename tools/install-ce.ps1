# install-ce.ps1 -- package, install and launch the app on a webOS CE device.
#
# The webOS SDK's palm-install / palm-launch / palm-log refuse to talk to a device
# reporting "webOS CE 3.1.0" ("unrecognized device version" -- a compatibility
# whitelist baked into the ~2011-era host tools that CE's version string isn't on).
# This script does the same steps by hand, over novacom, when the SDK tool fails:
#   install  -> push the .ipk and install it with the on-device ipkg directly
#   launch   -> a raw Luna Service call (palm://com.palm.applicationManager/launch)
#   logs     -> tail /var/log/messages instead of palm-log (same enyo-build.js
#               lines show up there, tagged {LunaSysMgrJS} and with the app id)
# On a normal (non-CE) device the plain SDK tools just work and this script never
# falls back to any of that.
#
#   powershell -ExecutionPolicy Bypass -File tools\install-ce.ps1              package + install + launch
#   powershell -ExecutionPolicy Bypass -File tools\install-ce.ps1 -NoLaunch    package + install only
#   powershell -ExecutionPolicy Bypass -File tools\install-ce.ps1 -Log         ...and tail the log after
#   powershell -ExecutionPolicy Bypass -File tools\install-ce.ps1 -NoRestart   skip the Luna restart (see below)
#
# After an install it restarts Luna (stop/start LunaSysMgr, about 40 seconds) before
# launching. The device keeps running the OLD app code after a reinstall -- even in a
# brand-new app process, even though the files on disk are correct -- until Luna is
# restarted; a full reboot is NOT needed (verified twice in a row with a build-stamp
# log line). The restart closes every open app on the device.
#
# Needs the webOS SDK (novacom, palm-package) on the PATH and the device in
# Developer Mode. Reinstalling the same version over itself works.

param([switch]$NoLaunch, [switch]$Log, [switch]$NoInstall, [switch]$NoRestart)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root "com.magq.quranreader"
$info = Get-Content (Join-Path $appDir "appinfo.json") -Raw | ConvertFrom-Json
$ipkName = "$($info.id)_$($info.version)_all.ipk"
$ipkPath = Join-Path $root $ipkName
$devFile = "/media/internal/.developer/$ipkName"

# Sends a local script to the device with plain LF line endings and no BOM (a
# PowerShell pipe adds both, which BusyBox sh on the device rejects), then runs it.
function Invoke-DeviceScript([string]$Script) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $bytes = [System.Text.Encoding]::ASCII.GetBytes(($Script -replace "`r`n", "`n") + "`n")
        [System.IO.File]::WriteAllBytes($tmp, $bytes)
        cmd /c "novacom put file:///tmp/install-ce-step.sh < `"$tmp`"" | Out-Null
        novacom run file:///bin/sh -- /tmp/install-ce-step.sh
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

$svcDir = Join-Path $root "com.magq.quranreader.service"
$pkgDir = Join-Path $root "com.magq.quranreader.package"
$pkgInfo = Get-Content (Join-Path $pkgDir "packageinfo.json") -Raw | ConvertFrom-Json
if ($pkgInfo.version -ne $info.version) {
    throw "packageinfo.json version ($($pkgInfo.version)) must match appinfo.json ($($info.version))"
}

Write-Host "== palm-package"
Set-Location $root
palm-package $pkgDir $appDir $svcDir
if (-not (Test-Path $ipkPath)) { throw "palm-package did not produce $ipkName" }
Write-Host ("== {0}  ({1:N1} MB)" -f $ipkName, ((Get-Item $ipkPath).Length / 1MB))

if (-not $NoInstall) {
    Write-Host "== palm-install"
    $ok = $true
    try { palm-install $ipkPath 2>&1 | Out-Host } catch { $ok = $false }
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    if (-not $ok) {
        Write-Host "== palm-install failed (unrecognized device version?) - installing by hand via ipkg"
        Invoke-DeviceScript "mkdir -p /media/internal/.developer" | Out-Null
        cmd /c "novacom put file://$devFile < `"$ipkPath`"" | Out-Null
        Invoke-DeviceScript "ipkg -o /media/cryptofs/apps -force-depends install $devFile 2>&1 | tail -6"
        Invoke-DeviceScript "rm -f $devFile" | Out-Null
        Write-Host "== installed via ipkg. First install of a brand-new app id needs a Luna restart"
        Write-Host "   before it shows in the launcher; updating an already-installed app does not."
    }

    # Neither install route runs the package's postinst, and the recitation fetch service is
    # not callable until it is registered on the Luna bus -- so do that step here (the same
    # script the release postinst uses). Also stops any old service process from serving stale code.
    Write-Host "== registering the recitation fetch service on the Luna bus"
    $register = (Get-Content (Join-Path $PSScriptRoot "release\register-service.sh") -Raw) -replace "@SERVICE_ID@", "$($info.id).service"
    Invoke-DeviceScript $register | Out-Host

    if (-not $NoRestart) {
        Write-Host "== restarting Luna so the new code is really the code that runs (about 40 s)"
        Invoke-DeviceScript "stop LunaSysMgr; sleep 3; start LunaSysMgr; sleep 25" | Out-Null
    }
}

if (-not $NoLaunch) {
    Write-Host "== launching"
    $ok = $true
    try { palm-launch $info.id 2>&1 | Out-Host } catch { $ok = $false }
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    if (-not $ok) {
        Write-Host "== palm-launch failed - launching via a raw Luna Service call instead"
        # Built with string concatenation, not "...\"..." escaping: PowerShell double-quoted
        # strings do not treat a backslash as an escape character, so \" does not actually
        # escape the quote -- it silently truncates the string mid-way instead.
        $launchJson = '{"id":"' + $info.id + '"}'
        Invoke-DeviceScript ("luna-send -n 1 palm://com.palm.applicationManager/launch '" + $launchJson + "'")
    }
}

if ($Log) {
    Write-Host "== recent log lines for $($info.id) (palm-log substitute: tail of /var/log/messages)"
    Invoke-DeviceScript "tail -n 300 /var/log/messages | grep -i '$($info.id)'"
}
