# Input driver for the cross-process GetSaveFileNameW fixture only.
param([Parameter(Mandatory)][uint32]$FixturePid,[Parameter(Mandatory)][string]$Target)
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$root=[IO.Path]::GetFullPath((Join-Path $repo 'desktop/reader-tests/test-results/save-dialog'))
$Target=[IO.Path]::GetFullPath($Target)
$fixture=Get-Process -Id $FixturePid -ErrorAction Stop
if($fixture.ProcessName -ne 'pwsh'){throw 'Only the PowerShell 7 dialog fixture is allowed'}
if(-not $Target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($Target) -ne '.pdf'){throw 'Synthetic fixture path required'}
$t=$null;$e=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'reader-window-check.ps1'),[ref]$t,[ref]$e)
if($e.Count){throw $e[0]}
$code=$ast.FindAll({param($n)$n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.StartsWith('using System;')},$true)[0].Value
Add-Type -TypeDefinition $code
. (Join-Path $PSScriptRoot 'save-dialog-input.ps1')
$sent=Send-ReaderSavePath -ProcessId $FixturePid -Target $Target
@{submitted=$sent;input=$script:ReaderSaveInputEvidence}|ConvertTo-Json -Depth 5 -Compress
