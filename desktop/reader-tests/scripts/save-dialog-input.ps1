# Shared by the installed Reader acceptance test and the real common-dialog smoke.
# Callers validate process ownership and restrict output to synthetic test folders.
function ConvertTo-ReaderSaveKeys([string]$Target) {
    -join @($Target.ToCharArray() | ForEach-Object {
        $character = [string]$_
        if ('+^%~(){}[]'.Contains($character)) { '{' + $character + '}' } else { $character }
    })
}

function Send-ReaderSavePath([uint32]$ProcessId, [string]$Target) {
    if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Save As input requires PowerShell 7; do not fall back to legacy SendKeys' }
    Add-Type -AssemblyName System.Windows.Forms
    $script:ReaderSaveInputEvidence=@{
        powershell=$PSVersionTable.PSVersion.ToString()
        forms=[System.Windows.Forms.SendKeys].Assembly.FullName
        before=[ReaderWindows]::SaveAsFilename($ProcessId)
    }
    $escaped = ConvertTo-ReaderSaveKeys $Target
    if (-not [ReaderWindows]::FocusSaveAs($ProcessId)) {
        $script:ReaderSaveInputEvidence.focused=$false
        return $false
    }
    $script:ReaderSaveInputEvidence.focused=$true
    [System.Windows.Forms.SendKeys]::SendWait('^a' + $escaped + '{ENTER}')
    $script:ReaderSaveInputEvidence.after=[ReaderWindows]::SaveAsFilename($ProcessId)
    return $true
}
