param(
  [string]$Python = "python",
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$TessdataDirectory = "",
  [string]$VenvDirectory = "",
  [switch]$SkipTesseractInstall
)

$ErrorActionPreference = "Stop"

if (-not $TessdataDirectory) {
  $TessdataDirectory = Join-Path $ProjectRoot ".models\tessdata"
}

if (-not $VenvDirectory) {
  $VenvDirectory = Join-Path $ProjectRoot ".venv-ocr"
}

$cacheRoot = Join-Path $ProjectRoot ".cache"
$modelsRoot = Join-Path $ProjectRoot ".models"
$pythonCacheRoot = Join-Path $cacheRoot "python"

$env:DOCTR_CACHE_DIR = Join-Path $modelsRoot "doctr"
$env:EASYOCR_MODULE_PATH = Join-Path $modelsRoot "easyocr"
$env:FLORIS_CACHE_ROOT = $cacheRoot
$env:FLORIS_MODELS_ROOT = $modelsRoot
$env:FLORIS_TESSDATA_DIR = $TessdataDirectory
$env:HF_HOME = Join-Path $modelsRoot "huggingface"
$env:HF_HUB_CACHE = Join-Path $modelsRoot "huggingface\hub"
$env:HUGGINGFACE_HUB_CACHE = Join-Path $modelsRoot "huggingface\hub"
$env:MANGA_OCR_HOME = Join-Path $modelsRoot "manga-ocr"
$env:MPLCONFIGDIR = Join-Path $pythonCacheRoot "matplotlib"
$env:NUMBA_CACHE_DIR = Join-Path $pythonCacheRoot "numba"
$env:PADDLE_HOME = Join-Path $modelsRoot "paddle"
$env:PADDLEOCR_HOME = Join-Path $modelsRoot "paddleocr"
$env:PIP_CACHE_DIR = Join-Path $pythonCacheRoot "pip"
$env:TESSDATA_PREFIX = $TessdataDirectory
$env:TORCH_HOME = Join-Path $modelsRoot "torch"
$env:TRANSFORMERS_CACHE = Join-Path $modelsRoot "huggingface\hub"
$env:XDG_CACHE_HOME = $pythonCacheRoot

@(
  $cacheRoot,
  $modelsRoot,
  $pythonCacheRoot,
  $env:PIP_CACHE_DIR,
  $env:HF_HOME,
  $env:HF_HUB_CACHE,
  $env:PADDLE_HOME,
  $env:PADDLEOCR_HOME,
  $env:EASYOCR_MODULE_PATH,
  $env:DOCTR_CACHE_DIR,
  $env:MANGA_OCR_HOME,
  $env:TORCH_HOME,
  $TessdataDirectory
) | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

if (-not (Test-Path -LiteralPath $VenvDirectory)) {
  Write-Host "Creating local OCR virtual environment: $VenvDirectory"
  & $Python -m venv $VenvDirectory
}

$venvPython = Join-Path $VenvDirectory "Scripts\python.exe"
if (Test-Path -LiteralPath $venvPython) {
  $Python = $venvPython
}

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
& $Python -m pip install @pythonPackages
& $Python -m pip install --force-reinstall "numpy==1.26.4"

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
