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
  [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW")] static extern IntPtr SendNotificationTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
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
    IntPtr edit=IntPtr.Zero; int editId=0;
    var controls=new List<string>();
    var deadline=DateTime.UtcNow.AddSeconds(3);
    do {
      controls.Clear();
      EnumChildWindows(dialog,(h,p)=>{
        string kind=Class(h); int id=GetDlgCtrlID(h); controls.Add(kind+":"+id);
        if(kind!="Edit")return true;
        // OPENFILENAME uses edt1 (0x480) or an edit inside cmb13 (0x47c).
        // Newer common-dialog templates also expose filename Edit 1001.
        bool filename=id==0x480 || id==1001;
        for(var parent=GetParent(h);parent!=IntPtr.Zero && parent!=dialog;parent=GetParent(parent))
          if(GetDlgCtrlID(parent)==0x47c)filename=true;
        if(filename){edit=h;editId=id;} return true;
      },IntPtr.Zero);
      if(edit==IntPtr.Zero)System.Threading.Thread.Sleep(100);
    } while(edit==IntPtr.Zero && DateTime.UtcNow<deadline);
    if(edit==IntPtr.Zero)throw new Exception("Common dialog filename control not found; controls: "+String.Join(",",controls));
    IntPtr result;
    // Use the common-dialog API so the dialog updates its parsed path state,
    // not only the visible edit text.
    if(SendMessageTimeout(dialog,0x0468,new IntPtr(editId),path,2,2000,out result)==IntPtr.Zero)
      throw new Exception("Common dialog did not accept filename control update");
    var actual=new StringBuilder(32768);
    if(ReadMessageTimeout(edit,13,new IntPtr(actual.Capacity),actual,2,2000,out result)==IntPtr.Zero || actual.ToString()!=path)
      throw new Exception("Common dialog filename field differs from exact destination");
    var resolved=new StringBuilder(32768);
    if(ReadMessageTimeout(dialog,0x0465,new IntPtr(resolved.Capacity),resolved,2,2000,out result)==IntPtr.Zero)
      throw new Exception("Common dialog could not resolve the selected file path");
    if(!String.Equals(resolved.ToString(),path,StringComparison.OrdinalIgnoreCase))
      throw new Exception("Common dialog resolved a different destination. Requested: "+path+"; resolved: "+resolved.ToString());
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
