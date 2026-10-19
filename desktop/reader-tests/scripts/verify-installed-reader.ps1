# Runs only on a clean GitHub-hosted Windows runner; never installs on a user's PC.
param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$root = Join-Path $env:LOCALAPPDATA 'sReader PDF'
if (Test-Path -LiteralPath $root) { throw 'Reader is already installed; refuse to overwrite it' }
$app = $null
$tracked = @()
try {
    $install = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($install.ExitCode -ne 0) { throw "Reader install failed: $($install.ExitCode)" }
    $exe = Join-Path $root 'solyan-pdf-reader.exe'
    if (-not (Test-Path -LiteralPath $exe)) { throw 'Reader executable missing' }
    foreach ($engine in @('core','office','ocr','sign','archive')) {
        if (Test-Path -LiteralPath (Join-Path $root $engine)) { throw "Unexpected Tools resource: $engine" }
    }
    $app = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 5
    $app.Refresh()
    if ($app.HasExited) { throw 'Installed Reader exited before startup smoke' }
    $engines = @(Get-Process -Name solyan-core,solyan-office,solyan-ocr,solyan-sign,solyan-archive -ErrorAction SilentlyContinue)
    if ($engines.Count) { throw 'Reader started a Tools engine' }
    # Record only this application's process tree; never kill unrelated WebViews.
    $all = @(Get-CimInstance Win32_Process)
    $tracked = @([uint32]$app.Id)
    do {
        $children = @($all | Where-Object { $_.ParentProcessId -in $tracked -and $_.ProcessId -notin $tracked } | Select-Object -ExpandProperty ProcessId)
        $tracked += $children
    } while ($children.Count)
    "reader_running=true; tools_engines=0; reader_pid=$($app.Id); child_processes=$($tracked.Count - 1)"
} finally {
    if ($app -and -not $app.HasExited) {
        & taskkill.exe /PID $app.Id /T /F
        if ($LASTEXITCODE -ne 0) { throw 'Failed to stop Reader process tree' }
    }
    foreach ($processId in $tracked) {
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { throw "Reader process orphan: $processId" }
    }
    $uninstaller = Join-Path $root 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
        if ($uninstall.ExitCode -ne 0) { throw "Reader uninstall failed: $($uninstall.ExitCode)" }
        $deadline = (Get-Date).AddSeconds(30)
        while ((Test-Path -LiteralPath (Join-Path $root 'solyan-pdf-reader.exe')) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        if (Test-Path -LiteralPath (Join-Path $root 'solyan-pdf-reader.exe')) { throw 'Reader executable remains after uninstall' }
        'reader_uninstalled=true; reader_orphans=0'
    } elseif (Test-Path -LiteralPath $root) { throw 'Reader uninstaller missing' }
}
