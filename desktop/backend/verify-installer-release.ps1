<#
D6 release acceptance for SolYan PDF Windows NSIS.
Run ONLY against the disposable GitHub Actions current-user install after the
full desktop functional smoke. Never delete directories or user documents.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$InstallerPath,
  [Parameter(Mandatory)][string]$InstallRoot,
  [Parameter(Mandatory)][string]$AppPath,
  [string]$ArtifactDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $ArtifactDirectory | Out-Null

$installer = (Resolve-Path -LiteralPath $InstallerPath -ErrorAction Stop).Path
$root = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
$appExe = [System.IO.Path]::GetFullPath($AppPath)
$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
if (-not $appExe.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "D6 refusal: app executable is not inside the chosen install root"
}
if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) {
  throw "D6 refusal: installed application is missing"
}
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "D6 refusal: installation root does not exist"
}

$config = Get-Content "desktop/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$cargo = Get-Content "desktop/src-tauri/Cargo.toml" -Raw
$versionMatch = [regex]::Match($cargo, '(?m)^version\s*=\s*"([^"]+)"')
if (-not $versionMatch.Success -or $config.version -ne $versionMatch.Groups[1].Value) {
  throw "D6 release gate: Cargo and Tauri desktop versions differ"
}
if ($config.productName -ne "SolYan PDF" -or $config.bundle.windows.nsis.installMode -ne "currentUser") {
  throw "D6 release gate: installer identity or scope drifted"
}

$sha = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$installerInfo = Get-Item -LiteralPath $installer -ErrorAction Stop
$report = [ordered]@{
  status = "pending"
  repo = "solyan842/SolYan-PDF"
  git_sha = $env:GITHUB_SHA
  os = "windows"
  installer_name = $installerInfo.Name
  installer_bytes = [int64]$installerInfo.Length
  installer_sha256 = $sha
  product_name = $config.productName
  desktop_version = $config.version
  install_mode = "currentUser"
  installed_app_found = $true
  expected_sidecars = @("solyan-core.exe", "solyan-office.exe", "solyan-ocr.exe", "solyan-sign.exe", "solyan-archive.exe")
  silent_uninstall = $false
  installed_executables_removed = $false
}

$manifestPath = Join-Path $ArtifactDirectory "desktop-windows-release-gate.json"
$checksumPath = Join-Path $ArtifactDirectory "SolYan-PDF-Windows-x64.sha256"
"$sha *$($installerInfo.Name)" | Set-Content -Path $checksumPath -Encoding ascii

try {
  $installed = [System.Collections.Generic.List[string]]::new()
  $installed.Add($appExe)
  foreach ($name in $report.expected_sidecars) {
    $item = Get-ChildItem -LiteralPath $root -Filter $name -File -Recurse -ErrorAction Stop |
      Select-Object -First 1
    if (-not $item) { throw "D6 gate: installed runtime missing: $name" }
    $installed.Add($item.FullName)
  }

  # Only accept a recognized NSIS uninstaller immediately under the verified
  # app root. Never execute an uninstaller from a bundled third-party runtime.
  $uninstallers = @(Get-ChildItem -LiteralPath $root -File -ErrorAction Stop |
    Where-Object { $_.Name -match '^(?:uninstall(?:[^\\/]*)|unins\d+)\.exe$' })
  if ($uninstallers.Count -ne 1) {
    throw "D6 gate: expected exactly one app-level NSIS uninstaller; found $($uninstallers.Count)"
  }
  $report["uninstaller_name"] = $uninstallers[0].Name

  $process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList "/S" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "D6 gate: NSIS silent uninstall exited $($process.ExitCode)"
  }
  $report["silent_uninstall"] = $true

  # NSIS may move its uninstaller to a temporary directory, finish removing
  # files asynchronously, and leave user settings behind. Check shipped binary
  # removal, not the absence of every directory in LOCALAPPDATA.
  $remaining = @()
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    $remaining = @($installed | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    if ($remaining.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  if ($remaining.Count) {
    throw "D6 gate: uninstall left installed application/runtime binaries: $($remaining.Count)"
  }
  foreach ($name in @("solyan-core", "solyan-office", "solyan-ocr", "solyan-sign", "solyan-archive")) {
    if (Get-Process -Name $name -ErrorAction SilentlyContinue) {
      throw "D6 gate: $name remains running after uninstall"
    }
  }
  $report["installed_executables_removed"] = $true
  $report["status"] = "PASS"
  Write-Host "Windows D6 installer checksum and silent uninstall gate PASS"
  Write-Host "SHA256 $sha *$($installerInfo.Name)"
}
finally {
  $report | ConvertTo-Json -Depth 6 |
    Set-Content -Path $manifestPath -Encoding utf8
}
