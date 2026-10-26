Add-Type -AssemblyName System.Drawing

$width = 900
$height = 300
$output = Join-Path $PSScriptRoot '..\build\portable-splash.bmp'
$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(38, 38, 38))

  $panelPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $panelPath.AddArc(0, 0, 88, 88, 180, 90)
  $panelPath.AddArc($width - 88, 0, 88, 88, 270, 90)
  $panelPath.AddArc($width - 88, $height - 88, 88, 88, 0, 90)
  $panelPath.AddArc(0, $height - 88, 88, 88, 90, 90)
  $panelPath.CloseFigure()

  $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 38, 38))
  $panelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(92, 92, 92), 1)
  $graphics.FillPath($panelBrush, $panelPath)
  $graphics.DrawPath($panelPen, $panelPath)

  $titleFont = New-Object System.Drawing.Font('Segoe UI', 27, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 14)
  $smallFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 11)
  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 245, 245))
  $bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 205, 205))
  $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 160, 160))
  $graphics.DrawString('V7 Wallpaper Studio', $titleFont, $whiteBrush, 48, 46)
  $graphics.DrawString(([char]0x6b63 + [char]0x5728 + [char]0x89e3 + [char]0x5305 + [char]0x58c1 + [char]0x7eb8 + [char]0x8d44 + [char]0x6e90 + [char]0xFF0C + [char]0x8bf7 + [char]0x7a0d + [char]0x5019 + '...'), $bodyFont, $bodyBrush, 49, 104)

  $barRect = New-Object System.Drawing.Rectangle(48, 157, 804, 22)
  $barPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(125, 125, 125), 1)
  $barBack = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(54, 54, 54))
  $barFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(155, 155, 155))
  $graphics.FillRectangle($barBack, $barRect)
  $graphics.FillRectangle($barFill, 49, 158, 338, 20)
  $graphics.DrawRectangle($barPen, $barRect)

  $graphics.DrawString(([char]0x9996 + [char]0x6b21 + [char]0x542f + [char]0x52a8 + [char]0x4f1a + [char]0x51c6 + [char]0x5907 + [char]0x5168 + [char]0x90e8 + [char]0x6a21 + [char]0x578b + [char]0xFF0C + [char]0x5b8c + [char]0x6210 + [char]0x540e + [char]0x5c06 + [char]0x81ea + [char]0x52a8 + [char]0x6253 + [char]0x5f00 + [char]0x4e3b + [char]0x754c + [char]0x9762), $smallFont, $mutedBrush, 49, 218)
  $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Bmp)
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output "Created $output"
