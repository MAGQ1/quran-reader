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
#
# Needs the webOS SDK (novacom, palm-package) on the PATH and the device in
# Developer Mode. Bump "version" in appinfo.json before re-running against an
# already-installed app -- ipkg refuses to "upgrade" to a same-or-lower version,
# same as palm-install.

param([switch]$NoLaunch, [switch]$Log, [switch]$NoInstall)

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

Write-Host "== palm-package"
Set-Location $root
palm-package $appDir
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
}

if (-not $NoLaunch) {
    Write-Host "== launching"
    $ok = $true
    try { palm-launch $info.id 2>&1 | Out-Host } catch { $ok = $false }
    if ($LASTEXITCODE -ne 0) { $ok = $false }

    if (-not $ok) {
        Write-Host "== palm-launch failed - launching via a raw Luna Service call instead"
        Invoke-DeviceScript "luna-send -n 1 palm://com.palm.applicationManager/launch '{\"id\":\"$($info.id)\"}'"
    }
}

if ($Log) {
    Write-Host "== recent log lines for $($info.id) (palm-log substitute: tail of /var/log/messages)"
    Invoke-DeviceScript "tail -n 300 /var/log/messages | grep -i '$($info.id)'"
}
