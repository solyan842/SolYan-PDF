# Install only on a clean, disposable Windows runner. Never on the owner's PC.
param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$root = Join-Path $env:LOCALAPPDATA 'sReader PDF'
if (Test-Path -LiteralPath $root) { throw 'Reader is already installed; refuse to overwrite it' }
$exe = Join-Path $root 'solyan-pdf-reader.exe'
try {
    $install = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($install.ExitCode -ne 0) { throw "Reader install failed: $($install.ExitCode)" }
    if (-not (Test-Path -LiteralPath $exe)) { throw 'Reader executable missing' }
    foreach ($engine in @('core','office','ocr','sign','archive')) {
        if (Test-Path -LiteralPath (Join-Path $root $engine)) { throw "Unexpected Tools resource: $engine" }
    }
    & node desktop/reader-tests/native-activation.mjs $exe
    if ($LASTEXITCODE -ne 0) { throw "Installed Reader activation failed: $LASTEXITCODE" }
    'reader_running=true; native_activation=true; tools_engines=0; reader_orphans=0'
} finally {
    # Keep only reports/screenshots, never WebView profiles or local signature data.
    $results = 'desktop/reader-tests/test-results/native-activation'
    if (Test-Path -LiteralPath $results) {
        New-Item -ItemType Directory -Force artifacts/reader-native-results | Out-Null
        Get-ChildItem -LiteralPath $results -File | Where-Object { $_.Extension -in @('.json','.png') } | Copy-Item -Destination artifacts/reader-native-results/
    }
    # Fallback cleanup if a failed test left its installed Reader alive.
    foreach ($app in @(Get-Process -Name solyan-pdf-reader -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })) {
        & taskkill.exe /PID $app.Id /T /F
        if ($LASTEXITCODE -ne 0) { throw 'Failed to stop Reader process tree' }
        $app | Wait-Process -Timeout 10 -ErrorAction Stop
    }
    $uninstaller = Join-Path $root 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
        if ($uninstall.ExitCode -ne 0) { throw "Reader uninstall failed: $($uninstall.ExitCode)" }
        $deadline = (Get-Date).AddSeconds(30)
        while ((Test-Path -LiteralPath $exe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        if (Test-Path -LiteralPath $exe) { throw 'Reader executable remains after uninstall' }
        'reader_uninstalled=true'
    } elseif (Test-Path -LiteralPath $root) { throw 'Reader uninstaller missing' }
}
