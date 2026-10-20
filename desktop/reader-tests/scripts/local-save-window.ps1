# Portable Reader test only. No install, association or WebView policy changes.
param(
 [Parameter(Mandatory)][ValidateSet('Preflight','SaveAs','Cancel')][string]$Mode,
 [Parameter(Mandatory)][int]$ReaderPid,
 [Parameter(Mandatory)][string]$Exe,
 [string]$Target
)
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$allowedExe=[IO.Path]::GetFullPath((Join-Path $repo '../../outputs/Reader-local/solyan-pdf-reader.exe'))
$Exe=[IO.Path]::GetFullPath($Exe)
if($Exe -ine $allowedExe){throw 'Only the isolated local Reader build is allowed'}
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'reader-window-check.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw $errors[0]}
$code=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.StartsWith('using System;')},$true)[0].Value
if($Mode -eq 'Preflight'){
 $fixtureAst=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'test-save-dialog.ps1'),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw $errors[0]}
 $fixture=$fixtureAst.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('public static class DialogFixture')},$true)[0].Value
 Add-Type -TypeDefinition ($code+$fixture)
 $desktops=[DialogFixture]::Desktops()
 $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 $running=@(Get-Process -Name solyan-pdf-reader -ErrorAction SilentlyContinue)
 @{desktopReady=($desktops[0] -and $desktops[0] -ceq $desktops[1]);elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);runningReaderPids=@($running|Select-Object -ExpandProperty Id)}|ConvertTo-Json -Compress
 exit
}
$reader=Get-Process -Id $ReaderPid -ErrorAction Stop
if($reader.Path -ine $Exe){throw 'Reader PID/executable mismatch'}
Add-Type -TypeDefinition $code
if($Mode -eq 'Cancel'){
 @{cancelled=[ReaderWindows]::CancelOpen($ReaderPid)}|ConvertTo-Json -Compress
 exit
}
$root=[IO.Path]::GetFullPath((Join-Path $repo 'desktop/reader-tests/test-results/native-saveas-local'))
$Target=[IO.Path]::GetFullPath($Target)
if(-not $Target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($Target) -ne '.pdf'){throw 'Synthetic output path required'}
. (Join-Path $PSScriptRoot 'save-dialog-input.ps1')
$submitted=$false
if(-not (Test-Path -LiteralPath $Target -PathType Leaf)){$submitted=Send-ReaderSavePath -ProcessId $ReaderPid -Target $Target}
@{submitted=$submitted;saved=(Test-Path -LiteralPath $Target -PathType Leaf);dialogs=@([ReaderWindows]::Dialogs($ReaderPid))}|ConvertTo-Json -Compress
