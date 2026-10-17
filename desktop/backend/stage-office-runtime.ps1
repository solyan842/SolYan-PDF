param(
  [string]$OfficeRoot = "desktop/src-tauri/resources/office",
  [string]$ArtifactsRoot = "artifacts"
)

$ErrorActionPreference = "Stop"
$manifest = Get-Content "desktop/vendor/libreoffice-windows-x64.json" -Raw | ConvertFrom-Json
$msi = Join-Path (Get-Location) $manifest.asset
$extractRoot = Join-Path (Get-Location) "$OfficeRoot/libreoffice"
$logPath = Join-Path (Get-Location) "$ArtifactsRoot/libreoffice-msi-admin.log"

New-Item -ItemType Directory -Force $ArtifactsRoot | Out-Null
Remove-Item $OfficeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $OfficeRoot | Out-Null

Invoke-WebRequest -Uri $manifest.url -OutFile $msi
$actual = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = $manifest.sha256.ToLowerInvariant()
if ($actual -ne $expected) {
  throw "LibreOffice SHA256 mismatch: expected $expected, got $actual"
}

New-Item -ItemType Directory -Force $extractRoot | Out-Null
$arguments = @(
  "/a", "`"$msi`"",
  "/qn", "/norestart",
  "TARGETDIR=`"$extractRoot`"",
  "/L*v", "`"$logPath`""
)
$process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru -NoNewWindow
if ($process.ExitCode -ne 0) {
  throw "LibreOffice administrative extraction failed with MSI exit code $($process.ExitCode)"
}

$soffice = Get-ChildItem $extractRoot -Filter soffice.com -File -Recurse | Select-Object -First 1
if (-not $soffice) {
  $soffice = Get-ChildItem $extractRoot -Filter soffice.exe -File -Recurse | Select-Object -First 1
}
if (-not $soffice) { throw "soffice executable not found in extracted LibreOffice runtime" }

& $soffice.FullName --headless --version 2>&1 | Tee-Object -FilePath (Join-Path $ArtifactsRoot "desktop-libreoffice-version.log")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$programDir = $soffice.Directory.FullName
$vcFiles = Get-ChildItem $programDir -File | Where-Object { $_.Name -match '^(vcruntime|msvcp|concrt).*\.dll$' } | Select-Object -ExpandProperty Name
@(
  "libreoffice_version=$($manifest.version)",
  "libreoffice_release=$($manifest.release)",
  "libreoffice_asset=$($manifest.asset)",
  "libreoffice_sha256=$actual",
  "libreoffice_program=$programDir",
  "bundled_vc_runtime_files=$($vcFiles -join ',')"
) | Set-Content (Join-Path $ArtifactsRoot "desktop-office-runtime-lock.log")
