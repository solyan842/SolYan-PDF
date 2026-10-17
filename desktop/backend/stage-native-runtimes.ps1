param(
  [string]$CoreRoot = "desktop/src-tauri/resources/core",
  [string]$ArtifactsRoot = "artifacts"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $CoreRoot | Out-Null
New-Item -ItemType Directory -Force $ArtifactsRoot | Out-Null

function Get-PinnedRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath
  )

  $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
  Invoke-WebRequest -Uri $manifest.url -OutFile $ArchivePath
  $actual = (Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $expected = $manifest.sha256.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "$($manifest.name) SHA256 mismatch: expected $expected, got $actual"
  }
  Remove-Item $DestinationPath -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $DestinationPath | Out-Null
  Expand-Archive $ArchivePath -DestinationPath $DestinationPath -Force
  [PSCustomObject]@{
    Name = $manifest.name
    Version = $manifest.version
    Asset = $manifest.asset
    Sha256 = $actual
    Destination = $DestinationPath
  }
}

$qpdf = Get-PinnedRuntime `
  -ManifestPath "desktop/vendor/qpdf-windows-x64.json" `
  -ArchivePath "qpdf.zip" `
  -DestinationPath (Join-Path $CoreRoot "qpdf")

$poppler = Get-PinnedRuntime `
  -ManifestPath "desktop/vendor/poppler-windows-x64.json" `
  -ArchivePath "poppler.zip" `
  -DestinationPath (Join-Path $CoreRoot "poppler")

$qpdfExe = Get-ChildItem (Join-Path $CoreRoot "qpdf") -Filter qpdf.exe -File -Recurse | Select-Object -First 1
if (-not $qpdfExe) { throw "qpdf.exe not found in staged qpdf runtime" }
& $qpdfExe.FullName --version 2>&1 | Tee-Object -FilePath (Join-Path $ArtifactsRoot "desktop-qpdf-version.log")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pdftoppm = Get-ChildItem (Join-Path $CoreRoot "poppler") -Filter pdftoppm.exe -File -Recurse | Select-Object -First 1
$pdfinfo = Get-ChildItem (Join-Path $CoreRoot "poppler") -Filter pdfinfo.exe -File -Recurse | Select-Object -First 1
$pdftotext = Get-ChildItem (Join-Path $CoreRoot "poppler") -Filter pdftotext.exe -File -Recurse | Select-Object -First 1
$pdfimages = Get-ChildItem (Join-Path $CoreRoot "poppler") -Filter pdfimages.exe -File -Recurse | Select-Object -First 1
foreach ($tool in @($pdftoppm, $pdfinfo, $pdftotext, $pdfimages)) {
  if (-not $tool) { throw "Required Poppler CLI tool is missing from staged runtime" }
}
& $pdftoppm.FullName -v 2>&1 | Tee-Object -FilePath (Join-Path $ArtifactsRoot "desktop-poppler-version.log")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

@(
  "qpdf_version=$($qpdf.Version)",
  "qpdf_asset=$($qpdf.Asset)",
  "qpdf_sha256=$($qpdf.Sha256)",
  "poppler_version=$($poppler.Version)",
  "poppler_asset=$($poppler.Asset)",
  "poppler_sha256=$($poppler.Sha256)",
  "pdftoppm=$($pdftoppm.FullName)",
  "pdfinfo=$($pdfinfo.FullName)",
  "pdftotext=$($pdftotext.FullName)",
  "pdfimages=$($pdfimages.FullName)"
) | Set-Content (Join-Path $ArtifactsRoot "desktop-native-runtime-lock.log")
