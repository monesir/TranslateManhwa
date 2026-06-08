param(
  [string]$ImagePath,
  [string]$LanguageTag,
  [switch]$Check
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

function AwaitOperation($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      $_.IsGenericMethodDefinition -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function GetEngine([string]$Tag) {
  if ($Tag) {
    $language = [Windows.Globalization.Language]::new($Tag)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
    if ($engine -ne $null) {
      return $engine
    }
  }
  return [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}

if ($Check) {
  $engine = GetEngine $LanguageTag
  if ($engine -eq $null) {
    throw "Windows OCR engine is not available for the requested language."
  }
  @{ ok = $true; language = $engine.RecognizerLanguage.LanguageTag } |
    ConvertTo-Json -Compress
  exit 0
}

if (-not $ImagePath) {
  throw "ImagePath is required."
}

$resolvedPath = [System.IO.Path]::GetFullPath($ImagePath)
$engine = GetEngine $LanguageTag
if ($engine -eq $null) {
  throw "Windows OCR engine is not available for the requested language."
}

$file = AwaitOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPath)) ([Windows.Storage.StorageFile])
$stream = AwaitOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = AwaitOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = AwaitOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = AwaitOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$items = @()
$order = 1
foreach ($line in $result.Lines) {
  $words = @($line.Words)
  if ($words.Count -eq 0) {
    continue
  }

  $text = ($words | ForEach-Object { $_.Text }) -join " "
  $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $bottom = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum

  $items += @{
    text = $text
    confidence = $null
    readingOrder = $order
    region = @{
      type = "box"
      x = [Math]::Round([double]$left, 2)
      y = [Math]::Round([double]$top, 2)
      width = [Math]::Round([double]($right - $left), 2)
      height = [Math]::Round([double]($bottom - $top), 2)
    }
  }
  $order += 1
}

@{
  languageDetected = $engine.RecognizerLanguage.LanguageTag
  items = $items
} | ConvertTo-Json -Depth 8 -Compress
