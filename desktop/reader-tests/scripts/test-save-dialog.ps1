# Real GetSaveFileNameW smoke. This proves keyboard/path selection, not Reader
# PDF export. native-activation.mjs still gates the installed form/Save/source.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows GUI required' }
$taskTokens = $null; $taskErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'reader-window-check.ps1'),[ref]$taskTokens,[ref]$taskErrors)
if ($taskErrors.Count) { throw $taskErrors[0] }
$code = $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.StartsWith('using System;')},$true)[0].Value
. (Join-Path $PSScriptRoot 'save-dialog-input.ps1')
$fixture = @'

public static class DialogFixture {
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint id);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]
    static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder text,int size,out int needed);
    static string DesktopName(IntPtr desktop) {
        var text=new StringBuilder(256); int needed;
        return desktop != IntPtr.Zero && GetUserObjectInformation(desktop,2,text,512,out needed)?text.ToString():"";
    }
    public static string[] Desktops() {
        var input=OpenInputDesktop(0,false,1);
        try { return new string[]{DesktopName(GetThreadDesktop(GetCurrentThreadId())),DesktopName(input)}; }
        finally { if(input != IntPtr.Zero) CloseDesktop(input); }
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct OpenFileName {
        public int size; public IntPtr owner, instance;
        public string filter, customFilter; public int maxCustomFilter, filterIndex;
        public IntPtr file; public int maxFile;
        public string fileTitle; public int maxFileTitle;
        public string initialDir, title; public uint flags;
        public ushort fileOffset, fileExtension;
        public string defaultExtension; public IntPtr customData, hook;
        public string templateName; public IntPtr reserved; public uint reservedCount, flagsEx;
    }
    [DllImport("comdlg32.dll", CharSet=CharSet.Unicode)]
    static extern bool GetSaveFileName(ref OpenFileName dialog);
    [DllImport("comdlg32.dll")] static extern uint CommDlgExtendedError();
    static System.Threading.Thread worker;
    public static string SelectedPath;
    public static uint Error;
    public static string Failure;
    public static void Start(string folder) {
        if(worker != null && worker.IsAlive) throw new Exception("Previous dialog still open");
        SelectedPath=null; Error=0; Failure=null;
        worker=new System.Threading.Thread(()=> {
          IntPtr buffer=IntPtr.Zero;
          try {
            var dialog=new OpenFileName();
            dialog.size=Marshal.SizeOf(dialog);
            dialog.filter="PDF document\0*.pdf\0\0";
            var initial=new char[32768];
            var initialName="must-not-use-default.pdf";
            initialName.CopyTo(0,initial,0,initialName.Length);
            buffer=Marshal.AllocHGlobal(initial.Length*2);
            Marshal.Copy(initial,0,buffer,initial.Length);
            dialog.file=buffer;
            dialog.maxFile=32768; dialog.initialDir=folder;
            dialog.title="sReader synthetic Save As smoke";
            dialog.defaultExtension="pdf";
            // Same flags as reader_save_as in main.rs.
            dialog.flags=0x2 | 0x800 | 0x8;
            if(GetSaveFileName(ref dialog)) SelectedPath=Marshal.PtrToStringUni(dialog.file);
            else Error=CommDlgExtendedError();
          } catch(Exception exception) { Failure=exception.ToString(); }
          finally { if(buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer); }
        });
        worker.SetApartmentState(System.Threading.ApartmentState.STA);
        worker.IsBackground=true; worker.Start();
    }
    public static bool Wait(int milliseconds) { return worker.Join(milliseconds); }
}
'@
Add-Type -TypeDefinition ($code + $fixture)
$desktops = [DialogFixture]::Desktops()
if (-not $desktops[0] -or -not $desktops[1] -or $desktops[0] -cne $desktops[1]) {
    throw "Interactive desktop required: process='$($desktops[0])', input='$($desktops[1])'. No dialog/input was started. Run this script from a normal Windows PowerShell terminal."
}
Add-Type -AssemblyName System.Windows.Forms
$testRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'test-results/save-dialog'
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
$testRoot = [IO.Path]::GetFullPath($testRoot)
foreach ($name in @('working-copy.pdf', 'Tiếng Việt (1) + ^ % ~ {a} [b].pdf')) {
    $target = Join-Path $testRoot $name
    [DialogFixture]::Start($testRoot)
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        $submitted = $false
        do {
            $submitted = Send-ReaderSavePath -ProcessId $PID -Target $target
            if (-not $submitted) { Start-Sleep -Milliseconds 100 }
        } while (-not $submitted -and [DateTime]::UtcNow -lt $deadline)
        if ([DialogFixture]::Failure) { throw [DialogFixture]::Failure }
        if (-not $submitted) {
            [ReaderWindows]::Dialogs($PID) | Write-Output
            throw 'Could not verify modal foreground and filename Edit focus; run this smoke on the interactive Windows desktop'
        }
        if (-not [DialogFixture]::Wait(10000)) { throw 'Save As did not close after keyboard input' }
        if ([DialogFixture]::SelectedPath -cne $target) {
            throw "Wrong native destination: expected '$target', received '$([DialogFixture]::SelectedPath)' (dialog error $([DialogFixture]::Error))"
        }
        "native_dialog_path=PASS; filename=$name"
    } finally {
        if (-not [DialogFixture]::Wait(0)) {
            [ReaderWindows]::CancelOpen($PID) | Out-Null
            if (-not [DialogFixture]::Wait(5000)) { throw 'Synthetic dialog cleanup failed' }
        }
    }
}
[DialogFixture]::Start($testRoot)
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $cancelled = [ReaderWindows]::CancelOpen($PID)
        if (-not $cancelled) { Start-Sleep -Milliseconds 100 }
    } while (-not $cancelled -and [DateTime]::UtcNow -lt $deadline)
    if (-not $cancelled -or -not [DialogFixture]::Wait(5000)) { throw 'Native dialog cancellation failed' }
    if ($null -ne [DialogFixture]::SelectedPath -or [DialogFixture]::Error -ne 0) { throw 'Cancel was reported as a destination/error' }
    'native_dialog_cancel=PASS'
} finally {
    if (-not [DialogFixture]::Wait(0)) { [ReaderWindows]::CancelOpen($PID) | Out-Null }
}
