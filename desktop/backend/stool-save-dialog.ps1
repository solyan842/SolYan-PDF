param(
  [Parameter(Mandatory=$true)][int]$OwnerPid,
  [string]$Destination,
  [ValidateSet('Save','Cancel','DeclineOverwrite')][string]$Action='Save',
  [switch]$AllowOverwrite,
  [int]$TimeoutSeconds=30
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows runner required' }
if ($Action -ne 'Cancel' -and -not [IO.Path]::IsPathRooted($Destination)) { throw 'Absolute destination required' }
Get-Process -Id $OwnerPid -ErrorAction Stop | Out-Null
# Exercise the actual application-owned common dialog. No renderer invocation,
# download interception or filesystem write is substituted for the user's Save.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class StoolSaveDialog {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder b, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder b, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, string l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", CharSet=CharSet.Unicode)] static extern IntPtr ReadMessageTimeout(IntPtr h, uint m, IntPtr w, StringBuilder l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW")] static extern IntPtr SendCharacterTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static string Text(IntPtr h) { var b=new StringBuilder(32768); GetWindowText(h,b,b.Capacity); return b.ToString(); }
  static string Class(IntPtr h) { var b=new StringBuilder(256); GetClassName(h,b,b.Capacity); return b.ToString(); }
  public static IntPtr[] Dialogs(int pid) {
    var rows=new List<IntPtr>(); EnumWindows((h,p)=>{uint id; GetWindowThreadProcessId(h,out id);
      if(id==pid && IsWindowVisible(h) && Class(h)=="#32770") rows.Add(h); return true;},IntPtr.Zero); return rows.ToArray();
  }
  public static bool OwnedBy(IntPtr h, IntPtr owner) {
    for(int i=0;i<12 && h!=IntPtr.Zero;i++){h=GetWindow(h,4); if(h==owner)return true;} return false;
  }
  public static void Filename(IntPtr dialog,string path) {
    IntPtr edit=IntPtr.Zero;int editId=0;var fallback=IntPtr.Zero;int fallbackId=0;
    var controls=new List<string>();var deadline=DateTime.UtcNow.AddSeconds(3);
    do{
      controls.Clear();edit=IntPtr.Zero;fallback=IntPtr.Zero;
      EnumChildWindows(dialog,(h,p)=>{
        string kind=Class(h);int id=GetDlgCtrlID(h);controls.Add(kind+":"+id);
        if(kind!="Edit")return true;
        bool inCombo=false;
        for(var parent=GetParent(h);parent!=IntPtr.Zero&&parent!=dialog;parent=GetParent(parent))
          if(GetDlgCtrlID(parent)==0x47c)inCombo=true;
        if(id==0x480||inCombo){edit=h;editId=id;}
        else if(id==1001&&fallback==IntPtr.Zero){fallback=h;fallbackId=id;}
        return true;
      },IntPtr.Zero);
      if(edit==IntPtr.Zero&&fallback==IntPtr.Zero)System.Threading.Thread.Sleep(100);
    }while(edit==IntPtr.Zero&&fallback==IntPtr.Zero&&DateTime.UtcNow<deadline);
    if(edit==IntPtr.Zero){edit=fallback;editId=fallbackId;}
    if(edit==IntPtr.Zero)throw new Exception("Common dialog filename control not found; controls: "+String.Join(",",controls));
    IntPtr result;
    // Type into the filename control. WM_SETTEXT changes visible text but does
    // not reliably update the Explorer Save dialog's selected path.
    if(SendMessageTimeout(edit,12,IntPtr.Zero,"",2,2000,out result)==IntPtr.Zero)
      throw new Exception("Common dialog filename control "+editId+" could not be cleared");
    foreach(char ch in path)
      if(SendCharacterTimeout(edit,0x0102,new IntPtr((int)ch),new IntPtr(1),2,2000,out result)==IntPtr.Zero)
        throw new Exception("Common dialog filename control "+editId+" rejected character input");
    var actual=new StringBuilder(32768);
    if(ReadMessageTimeout(edit,13,new IntPtr(actual.Capacity),actual,2,2000,out result)==IntPtr.Zero||actual.ToString()!=path)
      throw new Exception("Filename control "+editId+" mismatch: "+actual.ToString());
  }
    public static void Click(IntPtr dialog,int id) {
    var button=GetDlgItem(dialog,id); if(button==IntPtr.Zero)throw new Exception("Dialog button missing: "+id);
    if(!PostMessage(dialog,273,new IntPtr(id),button))throw new Exception("Dialog click failed");
  }
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$dialog=[IntPtr]::Zero
while ([DateTime]::UtcNow -lt $deadline -and $dialog -eq [IntPtr]::Zero) {
  foreach($candidate in [StoolSaveDialog]::Dialogs($OwnerPid)) {
    $title=[StoolSaveDialog]::Text($candidate)
    if ($title.StartsWith('sTool PDF') -and $title.EndsWith('/ Save output')) { $dialog=$candidate; break }
  }
  if ($dialog -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 100 }
}
if ($dialog -eq [IntPtr]::Zero) { throw 'Application-owned sTool Save dialog not found before deadline' }
if ($Action -eq 'Cancel') { [StoolSaveDialog]::Click($dialog,2) }
else { [StoolSaveDialog]::Filename($dialog,$Destination); [StoolSaveDialog]::Click($dialog,1) }
$confirmed=$false
while ([DateTime]::UtcNow -lt $deadline -and [StoolSaveDialog]::IsWindowVisible($dialog)) {
  foreach ($candidate in [StoolSaveDialog]::Dialogs($OwnerPid)) {
    if ($candidate -eq $dialog -or -not [StoolSaveDialog]::OwnedBy($candidate,$dialog)) { continue }
    if ([StoolSaveDialog]::GetDlgItem($candidate,6) -ne [IntPtr]::Zero -and [StoolSaveDialog]::GetDlgItem($candidate,7) -ne [IntPtr]::Zero) {
      if ($confirmed) { continue }
      if ($Action -eq 'DeclineOverwrite') {
        [StoolSaveDialog]::Click($candidate,7)
        $confirmed=$true
        Start-Sleep -Milliseconds 200
        [StoolSaveDialog]::Click($dialog,2)
      } elseif ($AllowOverwrite) { [StoolSaveDialog]::Click($candidate,6); $confirmed=$true }
      else { throw 'Unexpected overwrite prompt; no overwrite authorization in test case' }
    } else { throw ('Unexpected owned Save dialog: '+[StoolSaveDialog]::Text($candidate)) }
  }
  Start-Sleep -Milliseconds 100
}
if ([StoolSaveDialog]::IsWindowVisible($dialog)) { throw 'Save dialog did not close before deadline' }
if (($Action -eq 'DeclineOverwrite' -or $AllowOverwrite) -and -not $confirmed) { throw 'Expected overwrite confirmation was not observed' }
@{action=$Action;destination=$Destination;ownerPid=$OwnerPid;overwriteConfirmed=$confirmed;dialogClosed=$true} | ConvertTo-Json -Compress
