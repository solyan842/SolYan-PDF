# Test transport only. Never invoked by the installed sTool application.
param(
    [Parameter(Mandatory)][ValidateSet('Setup','Cleanup')][string]$Mode,
    [Parameter(Mandatory)][string]$StateFile,
    [int]$Port,
    [string]$UserDataFolder
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$testRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'artifacts/stool-native'))
$StateFile = [IO.Path]::GetFullPath($StateFile)
if (-not $StateFile.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Policy state must stay inside native test results' }
$policyRoot = 'SOFTWARE\Policies\Microsoft\Edge\WebView2'
$allowedPaths = @("$policyRoot\AdditionalBrowserArguments", "$policyRoot\UserDataFolder")
$names = @('solyan-pdf-desktop.exe','vn.solyan.pdf')

function Save-State($state) { $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding UTF8 }
function Clear-TestPolicy($state) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64)
    try {
        foreach ($change in @($state.changes)) {
            if ($change.path -notin $allowedPaths -or $change.name -notin $names) { throw 'Unexpected policy state entry' }
            $key = $base.OpenSubKey($change.path,$true)
            if ($key) {
                try {
                    $current = $key.GetValue($change.name,$null)
                    if ($null -ne $current) {
                        if ($current -ne $change.value) { throw 'Test policy changed externally; refuse to delete it' }
                        $key.DeleteValue($change.name,$false)
                    }
                } finally { $key.Dispose() }
            }
        }
        foreach ($path in @($state.createdKeys)) {
            if ($path -notin $allowedPaths) { throw 'Unexpected policy key' }
            $key = $base.OpenSubKey($path)
            if ($key) {
                $empty = $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0
                $key.Dispose()
                if ($empty) { $base.DeleteSubKey($path,$false) }
            }
        }
    } finally { $base.Dispose() }
}

if ($Mode -eq 'Cleanup') {
    if (Test-Path -LiteralPath $StateFile) {
        $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        if (@($state.changes).Count) { Clear-TestPolicy $state }
        Remove-Item -LiteralPath $StateFile
    }
    @{ cleaned=$true } | ConvertTo-Json -Compress
    exit
}
if (Test-Path -LiteralPath $StateFile) { throw 'A policy state file already exists; clean it up before setup' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid CDP test port' }
$UserDataFolder = [IO.Path]::GetFullPath($UserDataFolder)
if (-not $UserDataFolder.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'WebView profile must stay inside native test results' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$runtimeVersions = @()
foreach ($folder in @((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'),(Join-Path $env:ProgramFiles 'Microsoft\EdgeWebView\Application'))) {
    if (Test-Path -LiteralPath $folder) {
        foreach ($version in @(Get-ChildItem -LiteralPath $folder -Directory)) {
            $runtime = Join-Path $version.FullName 'msedgewebview2.exe'
            if (Test-Path -LiteralPath $runtime) { $runtimeVersions += (Get-Item -LiteralPath $runtime).VersionInfo.ProductVersion }
        }
    }
}
$state = @{ changes=@(); createdKeys=@() }
Save-State $state
if ($elevated) {
    # WebView2 150+ drops environment/HKCU overrides for elevated hosts. Use its
    # supported HKLM channel for this EXE/AUMID only; no wildcard/global setting.
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64)
    try {
        foreach ($path in $allowedPaths) {
            $key = $base.OpenSubKey($path)
            if ($key) { $key.Dispose() } else { $state.createdKeys += $path }
            $key = $base.CreateSubKey($path)
            try {
                foreach ($name in $names) {
                    if ($name -in $key.GetValueNames()) { throw 'Pre-existing sTool WebView policy; refuse to overwrite it' }
                    $value = if ($path.EndsWith('\AdditionalBrowserArguments')) { "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port" } else { $UserDataFolder }
                    # Persist rollback information before changing the registry.
                    $state.changes += @{ path=$path; name=$name; value=$value }
                    Save-State $state
                    $key.SetValue($name,$value,[Microsoft.Win32.RegistryValueKind]::String)
                    if ($key.GetValue($name) -ne $value) { throw 'WebView test policy write did not persist' }
                }
            } finally { $key.Dispose() }
        }
    } catch {
        Clear-TestPolicy $state
        throw
    } finally { $base.Dispose() }
}
@{ elevated=$elevated; transport=$(if($elevated){'per-app-HKLM'}else{'child-environment'}); runtimeVersions=$runtimeVersions; port=$Port } | ConvertTo-Json -Depth 4 -Compress
