param(
    [ValidateSet('Inspect','Minimize','Association','CancelOpen','SaveAs','Resize','Memory')][string]$Mode = 'Inspect',
    [Parameter(Mandatory)][string]$Exe,
    [string]$FilePath,
    [int]$Width,
    [int]$Height
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
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetFocus();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool connect);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    public static int[] WindowBounds(IntPtr hwnd) {
        Rect rect;
        if (!GetWindowRect(hwnd, out rect)) return new int[0];
        return new [] { rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top };
    }
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    public static void Resize(IntPtr hwnd, int width, int height) {
        // SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE.
        if (!SetWindowPos(hwnd, IntPtr.Zero, 0, 0, width, height, 0x0016))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
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
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,IntPtr wparam,StringBuilder text,uint flags,uint timeout,out IntPtr result);
    public static string SaveAsFilename(uint processId) {
        string result=null;
        EnumWindows((hwnd,state)=>{
            uint owner;GetWindowThreadProcessId(hwnd,out owner);
            var kind=new StringBuilder(256);GetClassName(hwnd,kind,256);
            if(owner!=processId||kind.ToString()!="#32770")return true;
            var edit=Descendant(hwnd,1001);if(edit==IntPtr.Zero)return true;
            var editClass=new StringBuilder(256);GetClassName(edit,editClass,256);
            if(editClass.ToString()!="Edit")return true;
            var text=new StringBuilder(32768);IntPtr copied;
            result=SendMessageTimeout(edit,0x000D,new IntPtr(text.Capacity),text,2,1000,out copied)!=IntPtr.Zero?text.ToString():"<unavailable>";
            return false;
        },IntPtr.Zero);
        return result;
    }
    public static bool FocusSaveAs(uint processId) {
        bool found = false;
        EnumWindows((hwnd, state) => {
            uint owner; GetWindowThreadProcessId(hwnd, out owner);
            var kind = new StringBuilder(256); GetClassName(hwnd, kind, kind.Capacity);
            if (owner != processId || kind.ToString() != "#32770") return true;
            // Control 1001 was confirmed to be the filename Edit on the
            // installed GitHub Actions Windows dialog. Do not target the
            // breadcrumb Edit (41477) or trigger IDOK with stale filename.
            var edit = Descendant(hwnd,1001);
            if(edit == IntPtr.Zero) return true;
            var editClass = new StringBuilder(256);
            GetClassName(edit,editClass,editClass.Capacity);
            if(editClass.ToString() != "Edit") return true;
            uint editOwner; uint thread = GetWindowThreadProcessId(edit,out editOwner);
            uint ours = GetCurrentThreadId();
            bool attached = thread != ours && AttachThreadInput(ours,thread,true);
            if(thread != ours && !attached) return true;
            try {
                ShowWindow(hwnd,5);
                SetForegroundWindow(hwnd);
                SetFocus(edit);
                found = GetForegroundWindow() == hwnd && GetFocus() == edit;
            } finally {
                if(attached) AttachThreadInput(ours,thread,false);
            }
            return !found;
        },IntPtr.Zero);
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
    # Send input only after verifying both the PID-owned modal foreground and
    # its filename Edit focus. Actual output existence is asserted by Node.
    . (Join-Path $PSScriptRoot 'save-dialog-input.ps1')
    $sentInput = $false
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        $sentInput = Send-ReaderSavePath -ProcessId $apps[0].Id -Target $target
    }
    @{ submitted=$sentInput; input=$script:ReaderSaveInputEvidence; saved=(Test-Path -LiteralPath $target -PathType Leaf); dialogs=@([ReaderWindows]::Dialogs($apps[0].Id)) } | ConvertTo-Json -Compress
    exit
}
if ($Mode -eq 'CancelOpen') {
    if ($apps.Count -ne 1) { throw 'Expected one Reader process' }
    @{ cancelled=[ReaderWindows]::CancelOpen($apps[0].Id) } | ConvertTo-Json -Compress
    exit
}
if ($Mode -eq 'Resize') {
    if ($apps.Count -ne 1) { throw 'Expected one installed Reader process' }
    if ($Width -lt 1024 -or $Width -gt 2500 -or $Height -lt 700 -or $Height -gt 1600) { throw 'Unsafe Reader test window dimensions' }
    $windows = [ReaderWindows]::Windows($apps[0].Id)
    if ($windows.Count -ne 1) { throw 'Expected one Reader main window' }
    [ReaderWindows]::Resize([IntPtr]$windows[0],$Width,$Height)
    @{ requested=@($Width,$Height); bounds=@([ReaderWindows]::WindowBounds([IntPtr]$windows[0])); hwnd=$windows[0] } | ConvertTo-Json -Compress
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
    @{ pid=$_.Id; windows=@($windows); minimized=($windows.Count -eq 1 -and [ReaderWindows]::IsIconic([IntPtr]$windows[0])); maximized=($windows.Count -eq 1 -and [ReaderWindows]::IsZoomed([IntPtr]$windows[0])); bounds=$(if ($windows.Count -eq 1) { @([ReaderWindows]::WindowBounds([IntPtr]$windows[0])) } else { @() }); foreground=[ReaderWindows]::GetForegroundWindow().ToInt64() }
})
$engines = @(Get-Process -Name solyan-core,solyan-office,solyan-ocr,solyan-sign,solyan-archive -ErrorAction SilentlyContinue)
$all = @(Get-CimInstance Win32_Process)
$tracked = @($apps | Select-Object -ExpandProperty Id)
do {
    $children = @($all | Where-Object { $_.ParentProcessId -in $tracked -and $_.ProcessId -notin $tracked } | Select-Object -ExpandProperty ProcessId)
    $tracked += $children
} while ($children.Count)
if ($Mode -eq 'Memory') {
    if ($apps.Count -ne 1) { throw 'Expected one installed Reader process for memory sample' }
    $samples = @($tracked | ForEach-Object {
        $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($process) {
            @{ pid=$process.Id; name=$process.ProcessName; workingSetBytes=$process.WorkingSet64; privateBytes=$process.PrivateMemorySize64 }
        }
    })
    @{ scope='Reader root and descendant processes; point-in-time, not peak; working sets may share pages'; processes=$samples } | ConvertTo-Json -Depth 5 -Compress
    exit
}
$webviews = @($all | Where-Object { $_.ProcessId -in $tracked -and $_.Name -eq 'msedgewebview2.exe' } | ForEach-Object {
    @{ pid=$_.ProcessId; executable=$_.ExecutablePath; commandLine=$_.CommandLine }
})
@{ apps=$result; engines=$engines.Count; descendants=$tracked; livePids=@($all | Select-Object -ExpandProperty ProcessId); webviews=$webviews } | ConvertTo-Json -Depth 5 -Compress
