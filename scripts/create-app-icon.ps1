param(
  [string]$Source = 'E:\SDVX\LAZY_KFC\contents\data\graphics\tamaadv_chara\icon\icon_0001.png',
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\build')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $Source)) { throw "Icon source not found: $Source" }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($Source)
try {
  $cropSize = [Math]::Min($sourceImage.Width, $sourceImage.Height)
  $cropX = [int](($sourceImage.Width - $cropSize) / 2)
  $cropY = [int](($sourceImage.Height - $cropSize) / 2)
  $sizes = @(16, 32, 48, 64, 128, 256)
  $pngPath = Join-Path $OutputDirectory 'v7-wallpaper-studio.png'
  $trayPath = Join-Path $OutputDirectory 'v7-wallpaper-studio-tray.png'
  $icoPath = Join-Path $OutputDirectory 'v7-wallpaper-studio.ico'
  $pngBytes = @{}

  foreach ($size in $sizes) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new(0, 0, $size, $size), $cropX, $cropY, $cropSize, $cropSize, [System.Drawing.GraphicsUnit]::Pixel)
      } finally { $graphics.Dispose() }
      $stream = [System.IO.MemoryStream]::new()
      try {
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBytes[$size] = $stream.ToArray()
      } finally { $stream.Dispose() }
      if ($size -eq 256) { $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png) }
      if ($size -eq 64) { $bitmap.Save($trayPath, [System.Drawing.Imaging.ImageFormat]::Png) }
    } finally { $bitmap.Dispose() }
  }

  $headerSize = 6
  $entrySize = 16
  $offset = $headerSize + ($entrySize * $sizes.Count)
  $output = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($output)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    foreach ($size in $sizes) {
      $bytes = $pngBytes[$size]
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $bytes.Length
    }
    foreach ($size in $sizes) { $writer.Write($pngBytes[$size]) }
    [System.IO.File]::WriteAllBytes($icoPath, $output.ToArray())
  } finally {
    $writer.Dispose()
    $output.Dispose()
  }
  Write-Output "Created $pngPath"
  Write-Output "Created $trayPath"
  Write-Output "Created $icoPath"
} finally { $sourceImage.Dispose() }
