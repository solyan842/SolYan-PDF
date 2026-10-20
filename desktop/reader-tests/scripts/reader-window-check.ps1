param(
    [ValidateSet('Inspect','Minimize','Association','CancelOpen','SaveAs')][string]$Mode = 'Inspect',
    [Parameter(Mandatory)][string]$Exe,
    [string]$FilePath
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Disposable Actions runner required' }
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ReaderWindows {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr state);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd, EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string kind, string title);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool SetWindowText(IntPtr hwnd, string text);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
    public static long[] Windows(uint processId) {
        var result = new List<long>();
        EnumWindows((hwnd, state) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            var title = new StringBuilder(256); GetWindowText(hwnd, title, title.Capacity);
            if (owner == processId && title.ToString() == "sReader PDF") result.Add(hwnd.ToInt64());
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }
    public static bool CancelOpen(uint processId) {
        bool found = false;
        EnumWindows((hwnd, state) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            var kind = new StringBuilder(256); GetClassName(hwnd, kind, kind.Capacity);
            if (owner == processId && kind.ToString() == "#32770") {
                found = PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero); return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    static IntPtr Descendant(IntPtr hwnd, int id) {
        var result = GetDlgItem(hwnd,id); if(result != IntPtr.Zero) return result;
        EnumChildWindows(hwnd,(child,state)=>{if(GetDlgCtrlID(child)==id){result=child;return false;}return true;},IntPtr.Zero);return result;
    }
    public static string[] Dialogs(uint processId) {
        var result=new List<string>();EnumWindows((hwnd,state)=>{uint owner;GetWindowThreadProcessId(hwnd,out owner);var kind=new StringBuilder(256);GetClassName(hwnd,kind,256);if(owner!=processId||kind.ToString()!="#32770")return true;result.Add("dialog="+hwnd);EnumChildWindows(hwnd,(child,unused)=>{var c=new StringBuilder(256);GetClassName(child,c,256);result.Add("id="+GetDlgCtrlID(child)+" class="+c);return result.Count<150;},IntPtr.Zero);return true;},IntPtr.Zero);return result.ToArray();
    }
    public static bool SaveAs(uint processId, string path) {
        bool found = false;
        EnumWindows((hwnd, state) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            var kind = new StringBuilder(256); GetClassName(hwnd, kind, kind.Capacity);
            if (owner != processId || kind.ToString() != "#32770") return true;
            // Modern Windows Explorer-style GetSaveFileNameW uses an Edit with
            // control ID 1001 (confirmed by Reader CI #11 real dialog census).
            // The previous 1152/1148-only lookup never found the file-name box.
            var edit = Descendant(hwnd, 1001);
            if (edit == IntPtr.Zero) edit = Descendant(hwnd, 1152);
            if (edit == IntPtr.Zero) { var combo = Descendant(hwnd, 1148); if (combo != IntPtr.Zero) edit = FindWindowEx(combo,IntPtr.Zero,"Edit",null); }
            if (edit != IntPtr.Zero) {
                var editClass = new StringBuilder(256);
                GetClassName(edit, editClass, editClass.Capacity);
                if (editClass.ToString() == "Edit" && SetWindowText(edit,path)) {
                    found = PostMessage(hwnd,0x0111,new IntPtr(1),IntPtr.Zero);
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct ExecuteInfo {
        public int cbSize; public uint fMask; public IntPtr hwnd;
        public string lpVerb, lpFile, lpParameters, lpDirectory;
        public int nShow; public IntPtr hInstApp, lpIDList;
        public string lpClass; public IntPtr hkeyClass;
        public uint dwHotKey; public IntPtr hIcon, hProcess;
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool ShellExecuteEx(ref ExecuteInfo info);
    public static void OpenAs(string file, string progId) {
        var info = new ExecuteInfo(); info.cbSize = Marshal.SizeOf(info);
        info.fMask = 0x1 | 0x400;
        info.lpVerb = "open"; info.lpFile = file; info.lpClass = progId; info.nShow = 1;
        if (!ShellExecuteEx(ref info)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
}
'@
if ($Mode -eq 'Association') {
    # Explicit Explorer/Open With class; never change the user's default PDF app.
    $classes = 'Registry::HKEY_CURRENT_USER\Software\Classes'
    $progId = $null
    foreach ($candidate in @(Get-ChildItem -LiteralPath $classes)) {
        $commandKey = Join-Path $candidate.PSPath 'shell\open\command'
        if (Test-Path -LiteralPath $commandKey) {
            $command = (Get-Item -LiteralPath $commandKey).GetValue('')
            if ($command -and $command.IndexOf($Exe,[StringComparison]::OrdinalIgnoreCase) -ge 0) { $progId=$candidate.PSChildName; break }
        }
    }
    if (-not $progId) { throw 'Installed Reader PDF association command is missing' }
    [ReaderWindows]::OpenAs((Resolve-Path -LiteralPath $FilePath).Path,$progId)
    @{ associationClass=$progId; shellExecute=$true } | ConvertTo-Json -Compress
    exit
}
$apps = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Exe)) -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe })
if ($Mode -eq 'SaveAs') {
    if ($apps.Count -ne 1) { throw 'Expected one Reader process' }
    $testRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'desktop/reader-tests/test-results/native-activation'))
    $target = [IO.Path]::GetFullPath($FilePath)
    if (-not $target.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($target) -ne '.pdf') { throw 'Save test must stay inside synthetic native results' }
    @{ submitted=[ReaderWindows]::SaveAs($apps[0].Id,$target); dialogs=@([ReaderWindows]::Dialogs($apps[0].Id)) } | ConvertTo-Json -Compress
    exit
}
if ($Mode -eq 'CancelOpen') {
    if ($apps.Count -ne 1) { throw 'Expected one Reader process' }
    @{ cancelled=[ReaderWindows]::CancelOpen($apps[0].Id) } | ConvertTo-Json -Compress
    exit
}
if ($Mode -eq 'Minimize') {
    if ($apps.Count -ne 1) { throw 'Expected one installed Reader process' }
    $windows = [ReaderWindows]::Windows($apps[0].Id)
    if ($windows.Count -ne 1) { throw 'Expected one Reader main window' }
    [ReaderWindows]::ShowWindow([IntPtr]$windows[0],6) | Out-Null
}
$result = @($apps | ForEach-Object {
    $windows = [ReaderWindows]::Windows($_.Id)
    @{ pid=$_.Id; windows=@($windows); minimized=($windows.Count -eq 1 -and [ReaderWindows]::IsIconic([IntPtr]$windows[0])); maximized=($windows.Count -eq 1 -and [ReaderWindows]::IsZoomed([IntPtr]$windows[0])); foreground=[ReaderWindows]::GetForegroundWindow().ToInt64() }
})
$engines = @(Get-Process -Name solyan-core,solyan-office,solyan-ocr,solyan-sign,solyan-archive -ErrorAction SilentlyContinue)
$all = @(Get-CimInstance Win32_Process)
$tracked = @($apps | Select-Object -ExpandProperty Id)
do {
    $children = @($all | Where-Object { $_.ParentProcessId -in $tracked -and $_.ProcessId -notin $tracked } | Select-Object -ExpandProperty ProcessId)
    $tracked += $children
} while ($children.Count)
$webviews = @($all | Where-Object { $_.ProcessId -in $tracked -and $_.Name -eq 'msedgewebview2.exe' } | ForEach-Object {
    @{ pid=$_.ProcessId; executable=$_.ExecutablePath; commandLine=$_.CommandLine }
})
@{ apps=$result; engines=$engines.Count; descendants=$tracked; livePids=@($all | Select-Object -ExpandProperty ProcessId); webviews=$webviews } | ConvertTo-Json -Depth 5 -Compress
