param([string]$WindowHandle, [switch]$Interactive, [int]$X = 0, [int]$Y = 0, [int]$Width = 0, [int]$Height = 0)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesktopHost {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr extra);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder name, int count);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr extra);
}
'@
for ($attempt = 0; $attempt -lt 8; $attempt++) {
  $progman = [DesktopHost]::FindWindow('Progman', $null)
  if ($progman -ne [IntPtr]::Zero) {
    $result = [IntPtr]::Zero
    [DesktopHost]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$result) | Out-Null
  }
  $script:iconHost = [IntPtr]::Zero
  $script:iconView = [IntPtr]::Zero
  $callback = [DesktopHost+EnumProc]{
    param($window, $extra)
    $view = [DesktopHost]::FindWindowEx($window, [IntPtr]::Zero, 'SHELLDLL_DefView', $null)
    if ($view -ne [IntPtr]::Zero) {
      $script:iconHost = $window
      $script:iconView = $view
    }
    return $true
  }
  [DesktopHost]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  $worker = [IntPtr]::Zero
  if ($script:iconView -ne [IntPtr]::Zero) {
    $worker = [DesktopHost]::FindWindowEx($script:iconHost, [IntPtr]::Zero, 'WorkerW', $null)
  }
  if ($worker -eq [IntPtr]::Zero -and $script:iconView -ne [IntPtr]::Zero) {
    $worker = [DesktopHost]::FindWindowEx([IntPtr]::Zero, $script:iconHost, 'WorkerW', $null)
  }
  if ($worker -eq [IntPtr]::Zero) {
    $candidate = [IntPtr]::Zero
    while ($true) {
      $candidate = [DesktopHost]::FindWindowEx([IntPtr]::Zero, $candidate, 'WorkerW', $null)
      if ($candidate -eq [IntPtr]::Zero) { break }
      if ($candidate -ne $script:iconHost -and [DesktopHost]::FindWindowEx($candidate, [IntPtr]::Zero, 'SHELLDLL_DefView', $null) -eq [IntPtr]::Zero) {
        $worker = $candidate
        break
      }
    }
  }
  if ($worker -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 150
}
if ($worker -eq [IntPtr]::Zero) { throw 'Could not find an empty WorkerW desktop layer. Restart Windows Explorer and try again.' }
if (-not [DesktopHost]::IsWindow($worker)) { throw "WorkerW handle is not valid ($($worker.ToInt64()))." }
$hwnd = [IntPtr]::new([Int64]$WindowHandle)
if ($hwnd -eq [IntPtr]::Zero) { throw 'Invalid wallpaper window handle.' }
if (-not [DesktopHost]::IsWindow($hwnd)) { throw "Wallpaper window handle is not valid ($($hwnd.ToInt64()))." }
[Int64]$initialStyle = [DesktopHost]::GetWindowLongPtr($hwnd, -16).ToInt64()
[Int64]$initialExtendedStyle = [DesktopHost]::GetWindowLongPtr($hwnd, -20).ToInt64()
[Int64]$style = [DesktopHost]::GetWindowLongPtr($hwnd, -16).ToInt64()
$style = (($style -band (-bnot [Int64]0x80000000)) -band (-bnot [Int64]0x00C00000)) -bor [Int64]0x40000000 -bor [Int64]0x10000000
$setStyleResult = [DesktopHost]::SetWindowLongPtr($hwnd, -16, [IntPtr]::new($style))
if ($setStyleResult -eq [IntPtr]::Zero -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 0) { throw "Could not set native window child style (error=$([Runtime.InteropServices.Marshal]::GetLastWin32Error()))." }
$styleRefreshFlags = 0x0027
if (-not [DesktopHost]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, 0, 0, $styleRefreshFlags)) { throw "Could not refresh native window style (error=$([Runtime.InteropServices.Marshal]::GetLastWin32Error()))." }
$parents = @()
if ($Interactive) {
  $parents += $script:iconHost
  if ($progman -ne [IntPtr]::Zero) { $parents += $progman }
} else {
  $parents += $worker
  $parents += $script:iconHost
  if ($progman -ne [IntPtr]::Zero) { $parents += $progman }
}
$attachedParent = [IntPtr]::Zero
$actualParent = [IntPtr]::Zero
$setParentError = 0
foreach ($parent in $parents) {
  [DesktopHost]::SetParent($hwnd, $parent) | Out-Null
  $setParentError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $actualParent = [DesktopHost]::GetParent($hwnd)
  if ($actualParent.ToInt64() -eq $parent.ToInt64()) { $attachedParent = $parent; break }
}
if ($attachedParent -eq [IntPtr]::Zero) {
  $styleAfter = [DesktopHost]::GetWindowLongPtr($hwnd, -16).ToInt64()
  $windowClass = New-Object System.Text.StringBuilder 128
  $parentClass = New-Object System.Text.StringBuilder 128
  $workerClass = New-Object System.Text.StringBuilder 128
  [DesktopHost]::GetClassName($hwnd, $windowClass, $windowClass.Capacity) | Out-Null
  [DesktopHost]::GetClassName($actualParent, $parentClass, $parentClass.Capacity) | Out-Null
  [DesktopHost]::GetClassName($worker, $workerClass, $workerClass.Capacity) | Out-Null
  throw "Could not attach native window to desktop host (hwnd=$($hwnd.ToInt64()) class=$windowClass, iconHost=$($script:iconHost.ToInt64()), iconView=$($script:iconView.ToInt64()), progman=$($progman.ToInt64()), worker=$($worker.ToInt64()) class=$workerClass, parent=$($actualParent.ToInt64()) class=$parentClass, error=$setParentError, styleBefore=0x$('{0:X}' -f $initialStyle), styleAfter=0x$('{0:X}' -f $styleAfter), exStyle=0x$('{0:X}' -f $initialExtendedStyle))."
}
if ($Interactive) {
  $insertAfter = [IntPtr]::Zero
  $flags = 0x0050
} else {
  $Width = [DesktopHost]::GetSystemMetrics(78)
  $Height = [DesktopHost]::GetSystemMetrics(79)
  $X = 0
  $Y = 0
  $insertAfter = if ($attachedParent.ToInt64() -eq $script:iconHost.ToInt64() -and $script:iconView -ne [IntPtr]::Zero) { $script:iconView } else { [IntPtr]::Zero }
  $flags = 0x0040
}
if (-not [DesktopHost]::SetWindowPos($hwnd, $insertAfter, $X, $Y, $Width, $Height, $flags)) { throw 'Could not size the wallpaper window to the desktop.' }
Write-Output 'attached'
