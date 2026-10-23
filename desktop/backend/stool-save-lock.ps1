param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Ready,[Parameter(Mandatory=$true)][string]$Stop)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows runner required' }
$root=[IO.Path]::GetFullPath('artifacts/stool-native')+[IO.Path]::DirectorySeparatorChar
foreach($target in @($Path,$Ready,$Stop)) {
  if (-not [IO.Path]::GetFullPath($target).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'Lock fixture must stay inside disposable test outputs' }
}
$file=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  [IO.File]::WriteAllText($Ready,'ready')
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  while(-not (Test-Path -LiteralPath $Stop)) {
    if([DateTime]::UtcNow -ge $deadline){throw 'Output lock release deadline exceeded'}
    Start-Sleep -Milliseconds 100
  }
} finally { $file.Dispose() }
