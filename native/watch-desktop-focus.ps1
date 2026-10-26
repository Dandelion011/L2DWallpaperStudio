Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesktopFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder text, int count);
}
'@
$last = ''
while ($true) {
  $window = [DesktopFocus]::GetForegroundWindow()
  $className = New-Object System.Text.StringBuilder 256
  [DesktopFocus]::GetClassName($window, $className, $className.Capacity) | Out-Null
  $state = if ($className.ToString() -in @('Progman', 'WorkerW')) { 'desktop' } else { 'other' }
  if ($state -ne $last) {
    [Console]::WriteLine($state)
    [Console]::Out.Flush()
    $last = $state
  }
  Start-Sleep -Milliseconds 250
}
