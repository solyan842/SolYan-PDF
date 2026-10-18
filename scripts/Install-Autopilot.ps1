# One-time setup on each Windows PC. Run from a clone of feat/autopilot-engine.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = 'solyan842/SolYan-PDF'
$sourceBranch = 'feat/windows-desktop-d4-text-integration'
$controllerBranch = 'feat/autopilot-engine'
$root = Join-Path $env:LOCALAPPDATA 'SolYan-PDF-Autopilot'
$app = Join-Path $root 'app'
$work = Join-Path $root 'work'
$taskName = 'SolYan-PDF-Autopilot'

foreach ($tool in @('git', 'gh', 'codex', 'python', 'pwsh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Missing $tool. Install it before running this setup."
    }
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Sign in first: gh auth login' }
$codexLogin = (& codex login status 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $codexLogin -notmatch '(?i)ChatGPT') {
    throw 'Use codex login with your ChatGPT account, not a paid API key'
}
& gh auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'gh auth setup-git failed' }
New-Item -ItemType Directory -Force $root | Out-Null

if (-not (Test-Path (Join-Path $app '.git'))) {
    & git clone --single-branch --branch $controllerBranch "https://github.com/$repo.git" $app
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the controller' }
} else {
    & git -C $app pull --ff-only origin $controllerBranch
    if ($LASTEXITCODE -ne 0) { throw 'Controller has local drift; do not overwrite' }
}
if (-not (Test-Path (Join-Path $work '.git'))) {
    & git clone --single-branch --branch $sourceBranch "https://github.com/$repo.git" $work
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the source branch' }
}
$username = (& gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or -not $username) { throw 'Cannot read GitHub user login' }
& git -C $work config user.name $username
& git -C $work config user.email "$username@users.noreply.github.com"

$python = (Get-Command python).Source
$worker = Join-Path $app 'autopilot\worker.py'
& python $worker status
if ($LASTEXITCODE -ne 0) {
    throw 'Autopilot status preflight failed: check control-plane branch and permissions'
}

$action = New-ScheduledTaskAction -Execute $python -Argument ('"{0}" once' -f $worker) -WorkingDirectory $app
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Installed ${taskName}: checks every 5 minutes when this user is logged on."
Write-Host "Source: $work"
Write-Host "Controller: $app"
Write-Host "Status: python $worker status"
