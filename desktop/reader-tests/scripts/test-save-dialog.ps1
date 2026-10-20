$ErrorActionPreference='Stop'
$taskTokens=$null;$taskErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'desktop/reader-tests/scripts/reader-window-check.ps1'),[ref]$taskTokens,[ref]$taskErrors)
$code=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.StartsWith('using System;')},$true)[0].Value

$fixture=@"

public static class DialogFixture {
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string kind,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
[DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hwnd);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int count);
[DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
public static bool Run(){var dialog=CreateWindowEx(0,"#32770","SolYan synthetic save test",0x80000000,0,0,300,200,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(dialog==IntPtr.Zero)throw new Exception("Fixture creation failed");try{var container=CreateWindowEx(0,"Static","",0x40000000,0,0,200,100,dialog,new IntPtr(100),IntPtr.Zero,IntPtr.Zero);var edit=CreateWindowEx(0,"Edit","",0x40000000,0,0,180,25,container,new IntPtr(1152),IntPtr.Zero,IntPtr.Zero);var submitted=ReaderWindows.SaveAs(GetCurrentProcessId(),"C:/synthetic/working-copy.pdf");var text=new StringBuilder(256);GetWindowText(edit,text,text.Capacity);Console.WriteLine("submitted="+submitted+"; filename="+text);return submitted&&text.ToString()=="C:/synthetic/working-copy.pdf";}finally{DestroyWindow(dialog);}}
}
"@
Add-Type -TypeDefinition ($code+$fixture)
if(-not [DialogFixture]::Run()){exit 1}

exit 0
