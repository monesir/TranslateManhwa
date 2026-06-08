param(
  [string]$Python = "python",
  [string]$TessdataDirectory = "$env:APPDATA\floris-manhwa-translator\tessdata",
  [switch]$SkipTesseractInstall
)

$ErrorActionPreference = "Stop"

$pythonPackages = @(
  "paddleocr==2.7.3",
  "paddlepaddle==2.6.2",
  "easyocr",
  "rapidocr",
  "manga-ocr",
  "python-doctr",
  "torch",
  "torchvision"
)

Write-Host "Installing local OCR Python packages..."
& $Python -m pip install --user @pythonPackages
& $Python -m pip install --user --force-reinstall "numpy==1.26.4"

if (-not $SkipTesseractInstall) {
  $tesseract = Get-Command tesseract -ErrorAction SilentlyContinue
  if (-not $tesseract -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Tesseract with winget..."
    winget install --id UB-Mannheim.TesseractOCR --exact --silent --accept-package-agreements --accept-source-agreements
  }
}

New-Item -ItemType Directory -Force -Path $TessdataDirectory | Out-Null
$languages = @("ara", "chi_sim", "chi_tra", "eng", "jpn", "kor", "osd")
foreach ($language in $languages) {
  $target = Join-Path $TessdataDirectory "$language.traineddata"
  if (Test-Path -LiteralPath $target) {
    Write-Host "Tesseract language already installed: $language"
    continue
  }

  $url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$language.traineddata"
  Write-Host "Downloading Tesseract language: $language"
  Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing
}

Write-Host "Local OCR setup complete."
