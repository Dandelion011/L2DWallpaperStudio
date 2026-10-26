Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DesktopMenu {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string cls, string title);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr extra);
  public struct Point { public int X; public int Y; }
}
'@
$script:iconView = [IntPtr]::Zero
$callback = [DesktopMenu+EnumProc]{
  param($window, $extra)
  $view = [DesktopMenu]::FindWindowEx($window, [IntPtr]::Zero, 'SHELLDLL_DefView', $null)
  if ($view -ne [IntPtr]::Zero) { $script:iconView = $view }
  return $true
}
[DesktopMenu]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
if ($script:iconView -eq [IntPtr]::Zero) {
  $progman = [DesktopMenu]::FindWindow('Progman', $null)
  $script:iconView = [DesktopMenu]::FindWindowEx($progman, [IntPtr]::Zero, 'SHELLDLL_DefView', $null)
}
if ($script:iconView -eq [IntPtr]::Zero) { exit 0 }
$point = New-Object DesktopMenu+Point
if (-not [DesktopMenu]::GetCursorPos([ref]$point)) { exit 0 }
$packed = ([Int64]($point.X -band 0xFFFF)) -bor (([Int64]($point.Y -band 0xFFFF)) -shl 16)
[DesktopMenu]::PostMessage($script:iconView, 0x007B, $script:iconView, [IntPtr]::new($packed)) | Out-Null
