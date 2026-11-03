<#
  Packs the Tauri release exe into an unsigned MSIX for the Microsoft Store.

  The Store re-signs MSIX packages it distributes, so no certificate is used
  here. The result is NOT installable by double click (Windows refuses an
  unsigned package outside the Store); it is only for upload to Partner Center.

  Usage (from apps/desktop, Windows, Windows SDK installed):
    pwsh msix/build-msix.ps1 -ExePath src-tauri/target/release/needt-desktop.exe

  Optional environment (GitHub Actions variables, so no commit is needed):
    MSIX_IDENTITY_NAME   Package/Identity/Name from Partner Center
    MSIX_PUBLISHER       Package/Identity/Publisher from Partner Center (CN=...)
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExePath,
  [string]$IconPath = 'src-tauri/icons/icon.png',
  [string]$TauriConf = 'src-tauri/tauri.conf.json',
  [string]$Manifest = 'msix/AppxManifest.xml',
  [string]$OutDir = 'src-tauri/target/msix'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

foreach ($p in @($ExePath, $IconPath, $TauriConf, $Manifest)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Missing input: $p" }
}

# --- version -----------------------------------------------------------------
# Store rules: four parts, the last is reserved for the Store and must be 0, the
# first must not be 0. tauri.conf.json says 0.1.0, so the package is
# (major+1).minor.patch.0 = 1.1.0.0. The mapping only ever grows.
$tauriVersion = (Get-Content -Raw -LiteralPath $TauriConf | ConvertFrom-Json).version
if ($tauriVersion -notmatch '^(\d+)\.(\d+)\.(\d+)') { throw "Unexpected version '$tauriVersion'" }
$msixVersion = '{0}.{1}.{2}.0' -f ([int]$Matches[1] + 1), $Matches[2], $Matches[3]

# --- staging -----------------------------------------------------------------
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$stage = Join-Path $OutDir 'stage'
$assets = Join-Path $stage 'Assets'
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force -Path $assets | Out-Null

Copy-Item -LiteralPath $ExePath -Destination (Join-Path $stage 'Needt.exe')

# --- manifest ----------------------------------------------------------------
[xml]$xml = Get-Content -Raw -LiteralPath $Manifest
$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace('m', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
$identity = $xml.SelectSingleNode('/m:Package/m:Identity', $ns)
$identity.SetAttribute('Version', $msixVersion)
if ($env:MSIX_IDENTITY_NAME) { $identity.SetAttribute('Name', $env:MSIX_IDENTITY_NAME) }
if ($env:MSIX_PUBLISHER) { $identity.SetAttribute('Publisher', $env:MSIX_PUBLISHER) }
$placeholder = ($identity.GetAttribute('Name') -like 'YOUR-*') -or ($identity.GetAttribute('Publisher') -like 'CN=YOUR-*')
if ($placeholder) {
  Write-Host "::warning title=MSIX identity is a placeholder::Fill Identity/Name and Identity/Publisher (msix/AppxManifest.xml, or the MSIX_IDENTITY_NAME and MSIX_PUBLISHER Actions variables) from Partner Center before uploading this package."
}
$xml.Save((Join-Path $stage 'AppxManifest.xml'))

# --- assets (from the committed 512 px icon) -----------------------------------
$src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $IconPath).Path)
function New-Asset([string]$name, [int]$w, [int]$h, [double]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $side = [single]([Math]::Min($w, $h) * $fill)
    $x = [single](($w - $side) / 2)
    $y = [single](($h - $side) / 2)
    $g.DrawImage($src, $x, $y, $side, $side)
    $bmp.Save((Join-Path $assets $name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $g.Dispose(); $bmp.Dispose() }
}

# Unqualified file (the manifest reference, always present) plus scale variants.
$logos = @(
  @{ Base = 'Square44x44Logo';   W = 44;  H = 44;  Fill = 1.0 },
  @{ Base = 'Square150x150Logo'; W = 150; H = 150; Fill = 1.0 },
  @{ Base = 'Wide310x150Logo';   W = 310; H = 150; Fill = 0.8 },
  @{ Base = 'StoreLogo';         W = 50;  H = 50;  Fill = 1.0 }
)
foreach ($l in $logos) {
  New-Asset "$($l.Base).png" $l.W $l.H $l.Fill
  foreach ($scale in 100, 125, 150, 200, 400) {
    New-Asset "$($l.Base).scale-$scale.png" ([int]($l.W * $scale / 100)) ([int]($l.H * $scale / 100)) $l.Fill
  }
}
# Taskbar, Start list and Alt+Tab icons without the plate behind them.
foreach ($size in 16, 24, 32, 48, 256) {
  New-Asset "Square44x44Logo.targetsize-${size}_altform-unplated.png" $size $size 1.0
}
$src.Dispose()

# --- MakeAppx ----------------------------------------------------------------
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$makeappx = Get-ChildItem -Path $kits -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\(\d+\.\d+\.\d+\.\d+)\\x64\\makeappx\.exe$' } |
  Select-Object FullName, @{ n = 'Ver'; e = { [version][regex]::Match($_.FullName, '\\(\d+\.\d+\.\d+\.\d+)\\x64\\').Groups[1].Value } } |
  Sort-Object Ver -Descending | Select-Object -First 1
if (-not $makeappx) { throw "makeappx.exe not found under $kits (install the Windows SDK)" }
Write-Host "makeappx: $($makeappx.FullName)"

$msix = Join-Path $OutDir ("Needt_{0}_x64.msix" -f $msixVersion)
& $makeappx.FullName pack /v /o /d $stage /p $msix
if ($LASTEXITCODE -ne 0) { throw "makeappx pack failed ($LASTEXITCODE)" }

# --- validation: unpack round trip -------------------------------------------
$check = Join-Path $OutDir 'unpacked'
& $makeappx.FullName unpack /o /p $msix /d $check
if ($LASTEXITCODE -ne 0) { throw "makeappx unpack failed ($LASTEXITCODE)" }

$stageRoot = (Resolve-Path $stage).Path.TrimEnd('\')
$missing = foreach ($f in Get-ChildItem -Recurse -File -Path $stage) {
  $rel = $f.FullName.Substring($stageRoot.Length + 1)
  if (-not (Test-Path -LiteralPath (Join-Path $check $rel))) { $rel }
}
if ($missing) { throw "Not in the package after round trip: $($missing -join ', ')" }

[xml]$back = Get-Content -Raw -LiteralPath (Join-Path $check 'AppxManifest.xml')
$bns = New-Object System.Xml.XmlNamespaceManager($back.NameTable)
$bns.AddNamespace('m', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
$bns.AddNamespace('uap', 'http://schemas.microsoft.com/appx/manifest/uap/windows10')
$bid = $back.SelectSingleNode('/m:Package/m:Identity', $bns)
if ($bid.GetAttribute('Version') -ne $msixVersion) { throw 'Version lost in round trip' }
$proto = $back.SelectSingleNode("//uap:Extension[@Category='windows.protocol']/uap:Protocol[@Name='needt']", $bns)
if (-not $proto) { throw 'needt: protocol declaration missing from the package' }
if ((Get-Item (Join-Path $check 'Needt.exe')).Length -ne (Get-Item $ExePath).Length) { throw 'Needt.exe differs after round trip' }
Remove-Item -Recurse -Force $check

$sig = (Get-AuthenticodeSignature $msix).Status
$size = [Math]::Round((Get-Item $msix).Length / 1MB, 1)
Write-Host "OK: $msix ($size MB, version $msixVersion, signature: $sig, identity placeholder: $placeholder)"
