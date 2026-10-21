# Disposable sTool-only install; never overwrite an owner installation.
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows'){throw 'Disposable Windows runner required'}
$expectedRoot=Join-Path $env:LOCALAPPDATA 'SolYan PDF'
if(Test-Path -LiteralPath $expectedRoot){throw 'Refuse to overwrite existing sTool install'}
if(Get-Process -Name solyan-pdf-desktop,solyan-core,solyan-office,solyan-ocr,solyan-sign,solyan-archive -ErrorAction SilentlyContinue){throw 'Pre-existing app/engine process; refuse install'}
$ErrorActionPreference = "Stop"
$installer = Get-ChildItem "desktop/src-tauri/target/release/bundle/nsis" -Filter "*.exe" | Select-Object -First 1
if (-not $installer) { throw "NSIS installer is unavailable for runtime smoke" }

$install = Start-Process -WindowStyle Hidden -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Silent installer failed with exit code $($install.ExitCode)" }

$expectedRoot = Join-Path $env:LOCALAPPDATA "SolYan PDF"
$candidatePaths = @(
  (Join-Path $expectedRoot "solyan-pdf-desktop.exe"),
  (Join-Path $expectedRoot "SolYan PDF.exe")
)
$appExe = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appExe) {
  $candidate = Get-ChildItem $env:LOCALAPPDATA -Filter "solyan-pdf-desktop.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $candidate) {
    $candidate = Get-ChildItem $env:LOCALAPPDATA -Filter "SolYan PDF.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if ($candidate) { $appExe = $candidate.FullName }
}
if (-not $appExe -or -not (Test-Path $appExe)) {
  Get-ChildItem $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*SolYan*" -or $_.Name -like "*solyan*" } |
    Select-Object FullName | Format-Table | Out-String |
    Set-Content "artifacts/desktop-install-location-diagnostic.log"
  throw "Installed SolYan PDF application executable was not found"
}

$installRoot = Split-Path $appExe -Parent
$coreExe = Get-ChildItem $installRoot -Filter "solyan-core.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$officeExe = Get-ChildItem $installRoot -Filter "solyan-office.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$sofficeExe = Get-ChildItem $installRoot -Filter "soffice.com" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sofficeExe) { $sofficeExe = Get-ChildItem $installRoot -Filter "soffice.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 }
$qpdfExe = Get-ChildItem $installRoot -Filter "qpdf.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$pdftoppmExe = Get-ChildItem $installRoot -Filter "pdftoppm.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$pdfinfoExe = Get-ChildItem $installRoot -Filter "pdfinfo.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $coreExe) { throw "Installed solyan-core.exe resource was not found" }
if (-not $officeExe) { throw "Installed solyan-office.exe resource was not found" }
if (-not $sofficeExe) { throw "Installed LibreOffice soffice resource was not found" }
if (-not $qpdfExe) { throw "Installed qpdf.exe resource was not found" }
if (-not $pdftoppmExe) { throw "Installed pdftoppm.exe resource was not found" }
if (-not $pdfinfoExe) { throw "Installed pdfinfo.exe resource was not found" }
$ocrExe = Get-ChildItem $installRoot -Filter "solyan-ocr.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$tesseractExe = Get-ChildItem $installRoot -Filter "tesseract.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$modelInventory = Get-ChildItem $installRoot -Filter "solyan-model-inventory.json" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ocrExe) { throw "Installed solyan-ocr.exe resource was not found" }
if (-not $tesseractExe) { throw "Installed Tesseract runtime was not found" }
if (-not $modelInventory) { throw "Installed offline Paddle model inventory was not found" }
$signExe = Get-ChildItem $installRoot -Filter "solyan-sign.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $signExe) { throw "Installed solyan-sign.exe was not found" }
$archiveExe = Get-ChildItem $installRoot -Filter "solyan-archive.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $archiveExe) { throw "Installed solyan-archive.exe was not found" }

$fixtures=Join-Path $env:RUNNER_TEMP 'stool-fixtures'
python desktop/backend/tests/stool_fixtures.py create $fixtures
if($LASTEXITCODE -ne 0){throw 'Fixture generation failed'}
node desktop/stool-tests/installed.mjs $appExe $fixtures 2>&1 | Tee-Object artifacts/stool-installed-ui.log
if($LASTEXITCODE -ne 0){throw 'Installed sTool lazy UI acceptance failed'}
# Verify two actual installed native capabilities, not merely process startup.
python desktop/backend/tests/sign_runtime_smoke.py --exe $signExe.FullName --output artifacts 2>&1 | Tee-Object -FilePath artifacts/desktop-installed-sign-smoke.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$tesseractBin = Split-Path $tesseractExe.FullName -Parent
$env:PATH = "$tesseractBin;$env:PATH"
$env:TESSDATA_PREFIX = Join-Path $tesseractBin "tessdata"
& .pdfa-venv/Scripts/python.exe desktop/backend/tests/pdfa_frozen_smoke.py --exe $archiveExe.FullName --output artifacts 2>&1 | Tee-Object -FilePath artifacts/desktop-installed-pdfa-smoke.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Frozen PyInstaller --onefile smoke processes must be gone BEFORE
# NSIS uninstall; no post-test taskkill workaround is allowed here.
$smokeOrphans = @(Get-Process -Name @("solyan-sign", "solyan-archive") -ErrorAction SilentlyContinue)
if ($smokeOrphans.Count -gt 0) {
  $smokeOrphans | Select-Object ProcessName, Id, Path |
    Format-List | Out-String | Set-Content artifacts/desktop-frozen-smoke-orphans.log
  throw "Installed functional smoke left frozen sidecar processes running"
}
"sign_and_archive_smoke_processes_released=true" |
  Set-Content artifacts/desktop-frozen-smoke-cleanup.log

# D6 gate runs only after the installed signing and PDF/A functional
# smokes have passed. Then verify the exact NSIS payload checksum
# and perform a real silent uninstall (without deleting user data).
& ./desktop/backend/verify-installer-release.ps1 -InstallerPath $installer.FullName -InstallRoot $installRoot -AppPath $appExe -ArtifactDirectory "artifacts" 2>&1 |
  Tee-Object -FilePath artifacts/desktop-d6-release-gate.log
$d6 = Get-Content artifacts/desktop-windows-release-gate.json -Raw | ConvertFrom-Json
if ($d6.status -ne "PASS" -or -not $d6.silent_uninstall -or -not $d6.installed_executables_removed) {
  throw "D6 installer verification was not completed"
}

