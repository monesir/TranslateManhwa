param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [Parameter(Mandatory = $true)]
  [int]$X,
  [Parameter(Mandatory = $true)]
  [int]$Y,
  [Parameter(Mandatory = $true)]
  [int]$Width,
  [Parameter(Mandatory = $true)]
  [int]$Height
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Image]::FromFile([System.IO.Path]::GetFullPath($SourcePath))
try {
  $safeX = [Math]::Max(0, [Math]::Min($X, $source.Width - 1))
  $safeY = [Math]::Max(0, [Math]::Min($Y, $source.Height - 1))
  $safeWidth = [Math]::Max(1, [Math]::Min($Width, $source.Width - $safeX))
  $safeHeight = [Math]::Max(1, [Math]::Min($Height, $source.Height - $safeY))

  $cropRect = [System.Drawing.Rectangle]::new($safeX, $safeY, $safeWidth, $safeHeight)
  $bitmap = [System.Drawing.Bitmap]::new($safeWidth, $safeHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $safeWidth, $safeHeight), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    $directory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($OutputPath))
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $bitmap.Save([System.IO.Path]::GetFullPath($OutputPath), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
} finally {
  $source.Dispose()
}
