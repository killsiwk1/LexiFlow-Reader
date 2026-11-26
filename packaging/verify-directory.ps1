param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Wizard {
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
 private delegate bool ChildProc(IntPtr h, IntPtr arg);
 [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, ChildProc callback, IntPtr arg);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr h, StringBuilder s, int capacity);
 [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 public static IntPtr VisibleEdit(IntPtr parent) {
   IntPtr found = IntPtr.Zero;
   EnumChildWindows(parent, (h,arg) => {
     var name = new StringBuilder(100);
     GetClassName(h,name,name.Capacity);
     if (name.ToString().Equals("Edit", StringComparison.OrdinalIgnoreCase) && IsWindowVisible(h)) { found = h; return false; }
     return true;
   }, IntPtr.Zero);
   return found;
 }
 [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr SetText(IntPtr h, uint msg, IntPtr w, string text);
 [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr ReadText(IntPtr h, uint msg, IntPtr count, StringBuilder text);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
}
'@
$base = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [Environment]::GetFolderPath('LocalApplicationData') }
$dest = Join-Path $base ("LexiFlow 自选路径 " + [guid]::NewGuid())
$p = Start-Process $Installer -PassThru
function Wait-For([scriptblock]$Probe, [int]$Seconds=60) {
  $end = (Get-Date).AddSeconds($Seconds)
  do { $v = & $Probe; if ($v) { return $v }; Start-Sleep -Milliseconds 350 } while ((Get-Date) -lt $end)
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
    $dialog = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { Write-Host $_.Current.ClassName $_.Current.Name $_.Current.IsEnabled }
  }
  throw "Timed out waiting for $Probe"
}
$h = Wait-For {
  $p.Refresh()
  if ($p.HasExited) { throw "Installer exited before showing welcome page: $($p.ExitCode)" }
  $handle = $p.MainWindowHandle
  if ($handle -ne 0 -and [Wizard]::GetDlgItem($handle,1) -ne 0) {
    $next = [System.Windows.Automation.AutomationElement]::FromHandle([Wizard]::GetDlgItem($handle,1))
    if ($next.Current.IsEnabled -and $next.Current.Name -match 'Next|下一步') { $handle }
  }
} 120
function Next-Page {
  $button = [Wizard]::GetDlgItem($h,1)
  if ($button -eq [IntPtr]::Zero -or ![Wizard]::PostMessage($h,0x111,1,$button)) { throw 'Wizard button unavailable' }
}
Write-Output "Welcome page reached."
Start-Sleep -Seconds 1
Next-Page
$edit = Wait-For {
  $inputHandle = [Wizard]::VisibleEdit($h)
  if ($inputHandle -ne [IntPtr]::Zero) { $inputHandle }
}
Write-Output "Directory page reached."
[void][Wizard]::SetText($edit,0xC,0,$dest)
$value = [System.Text.StringBuilder]::new(1024)
[void][Wizard]::ReadText($edit,0xD,$value.Capacity,$value)
if ($value.ToString() -ne $dest) { throw 'Directory page did not accept the path' }
Write-Output "Directory page accepted $dest"
Wait-For { [Wizard]::IsWindowEnabled([Wizard]::GetDlgItem($h,1)) }
Next-Page
Wait-For { [System.Windows.Automation.AutomationElement]::FromHandle([Wizard]::GetDlgItem($h,1)).Current.Name -match 'Install|安装' }
Next-Page
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LexiFlow'
Wait-For { (Get-ItemProperty $key -ErrorAction SilentlyContinue).InstallLocation -eq $dest } 240
foreach ($name in 'LexiFlow.exe','WebView2Loader.dll','Uninstall.exe') {
  if (!(Test-Path (Join-Path $dest $name))) { throw "Missing $name" }
}
$link = Join-Path ([Environment]::GetFolderPath('Programs')) 'LexiFlow.lnk'
if (!(Test-Path -LiteralPath $link)) { throw "Missing Start menu shortcut: $link" }
if ((Get-ItemProperty $key).UninstallString -ne ('"' + (Join-Path $dest 'Uninstall.exe') + '"')) { throw 'Wrong uninstall command' }
Write-Output "PASS directory page, custom path, executable, runtime loader and uninstall path."
$desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'LexiFlow.lnk'
if (!(Test-Path -LiteralPath $desktopLink)) { throw 'Missing desktop shortcut' }
Start-Process -FilePath $desktopLink
$app = Wait-For {
  Get-Process -Name LexiFlow -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq (Join-Path $dest 'LexiFlow.exe') -and $_.MainWindowHandle -ne [IntPtr]::Zero
  } | Select-Object -First 1
}
Write-Output "PASS desktop shortcut opened the installed application at $($app.Path)."
