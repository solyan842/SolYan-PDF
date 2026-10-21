param(
  [ValidateSet('Inspect','Close','Crash','Watch')][string]$Mode='Inspect',
  [Parameter(Mandatory)][string]$Exe,
  [Parameter(Mandatory)][int]$OwnerPid,
  [ValidateSet('core','office','ocr','sign','archive')][string]$Service='core',
  [string]$StopFile
)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows'){throw 'Disposable Windows runner required'}
$appPath=[IO.Path]::GetFullPath($Exe)
$root=[IO.Path]::GetDirectoryName($appPath)+[IO.Path]::DirectorySeparatorChar
$owner=Get-Process -Id $OwnerPid -ErrorAction Stop
if(-not [string]::Equals($owner.Path,$appPath,[StringComparison]::OrdinalIgnoreCase)){throw 'Owner PID/executable mismatch'}
function Snapshot {
  $owner.Refresh()
  $all=@(Get-CimInstance Win32_Process)
  $tracked=@($OwnerPid)
  do {$children=@($all | Where-Object {$_.ParentProcessId -in $tracked -and $_.ProcessId -notin $tracked} | Select-Object -ExpandProperty ProcessId);$tracked+=$children}while($children.Count)
  $rows=@($all | Where-Object {$_.ProcessId -in $tracked})
  $engines=@($rows | Where-Object {$_.Name -match '^solyan-(core|office|ocr|sign|archive)\.exe$'})
  $roots=@($engines | Where-Object {$parent=$_.ParentProcessId;$name=$_.Name;-not ($engines | Where-Object {$_.ProcessId -eq $parent -and $_.Name -eq $name})} | ForEach-Object {@{pid=$_.ProcessId;name=$_.Name}})
  $memory=@($tracked | ForEach-Object {$p=Get-Process -Id $_ -ErrorAction SilentlyContinue;if($p){@{pid=$p.Id;workingSetBytes=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64}}})
  @{roots=$roots;descendants=$tracked;window=$owner.MainWindowHandle.ToInt64();memory=$memory}
}
if($Mode -eq 'Close'){
  . (Join-Path $PSScriptRoot 'stool-close-response.ps1')
  Request-StoolWindowClose -Owner $owner | ConvertTo-Json -Compress
  exit
}
if($Mode -eq 'Crash'){
  $state=Snapshot
  $targets=@($state.roots | Where-Object {$_.name -eq "solyan-$Service.exe"})
  if($targets.Count -ne 1){throw 'Expected one owned service root'}
  $p=Get-Process -Id $targets[0].pid -ErrorAction Stop
  if(-not $p.Path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Service outside owned install'}
  # Kill only the test-owned sidecar tree, never the application or other tools.
  & taskkill.exe /PID $p.Id /T /F | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Crash injection failed'}
  @{crashed=$targets[0].pid} | ConvertTo-Json -Compress;exit
}
if($Mode -eq 'Watch'){
  $allowed=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'artifacts/stool-native'))+[IO.Path]::DirectorySeparatorChar
  $stop=[IO.Path]::GetFullPath($StopFile)
  if(-not $stop.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Monitor stop file outside artifacts'}
  $peakWorking=0L;$peakPrivate=0L;$samples=0;$watch=[Diagnostics.Stopwatch]::StartNew()
  do {
    $state=Snapshot
    $working=[int64](($state.memory | ForEach-Object {$_.workingSetBytes} | Measure-Object -Sum).Sum)
    $private=[int64](($state.memory | ForEach-Object {$_.privateBytes} | Measure-Object -Sum).Sum)
    $peakWorking=[Math]::Max($peakWorking,$working);$peakPrivate=[Math]::Max($peakPrivate,$private);$samples++
    Start-Sleep -Milliseconds 250
  }while(-not(Test-Path -LiteralPath $stop) -and $watch.Elapsed.TotalMinutes -lt 15)
  if(-not(Test-Path -LiteralPath $stop)){throw 'Monitor expired without completion'}
  @{sampledPeakWorkingSetBytes=$peakWorking;sampledPeakPrivateBytes=$peakPrivate;samples=$samples;elapsedMs=$watch.ElapsedMilliseconds;scope='owned process tree; sampled peak; shared working sets may double-count physical pages'} | ConvertTo-Json -Compress
  exit
}
Snapshot | ConvertTo-Json -Depth 6 -Compress
