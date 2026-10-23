param([string]$InitialDirectory)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows runner required' }
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.SaveFileDialog
$dialog.AutoUpgradeEnabled=$false
$dialog.Title='sTool PDF fixture / Save output'
$dialog.Filter='All files|*.*'
$dialog.FileName='fixture.pdf'
$dialog.InitialDirectory=$InitialDirectory
$dialog.OverwritePrompt=$true
$result=$dialog.ShowDialog()
@{result=$result.ToString();path=$dialog.FileName} | ConvertTo-Json -Compress
$dialog.Dispose()
