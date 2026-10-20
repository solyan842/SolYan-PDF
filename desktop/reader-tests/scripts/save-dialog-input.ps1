# Shared by the installed Reader acceptance test and the real common-dialog smoke.
# Callers validate process ownership and restrict output to synthetic test folders.
function ConvertTo-ReaderSaveKeys([string]$Target) {
    -join @($Target.ToCharArray() | ForEach-Object {
        $character = [string]$_
        if ('+^%~(){}[]'.Contains($character)) { '{' + $character + '}' } else { $character }
    })
}

function Send-ReaderSavePath([uint32]$ProcessId, [string]$Target) {
    Add-Type -AssemblyName System.Windows.Forms
    $escaped = ConvertTo-ReaderSaveKeys $Target
    if (-not [ReaderWindows]::FocusSaveAs($ProcessId)) { return $false }
    [System.Windows.Forms.SendKeys]::SendWait('^a' + $escaped + '{ENTER}')
    return $true
}
