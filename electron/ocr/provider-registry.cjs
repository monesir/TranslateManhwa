const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { getRuntimePaths, pythonRuntimeEnv } = require("../runtime-paths.cjs");
const { commandExists, runProcess } = require("./process-utils.cjs");

const RUNTIME_PATHS = getRuntimePaths();
const PYTHON_BRIDGE = path.join(__dirname, "python_ocr_bridge.py");
const PYTHON_CROP_SCRIPT = path.join(__dirname, "scripts", "crop-image.py");
const WINDOWS_OCR_SCRIPT = path.join(__dirname, "scripts", "windows-ocr.ps1");
const DEFAULT_OCR_PYTHON = path.join(RUNTIME_PATHS.repoRoot, ".venv-ocr", "Scripts", "python.exe");
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TESSDATA_LANGUAGES = ["ara", "chi_sim", "chi_tra", "eng", "jpn", "kor", "osd"];
const WINDOWS_OCR_FALLBACK_PROVIDERS = ["paddleocr", "doctr", "easyocr", "rapidocr"];
const REGION_CROP_MIN_WIDTH = 360;
const REGION_CROP_MIN_HEIGHT = 120;
const REGION_CROP_MAX_SCALE = 4;

const OCR_PROVIDERS = [
  {
    id: "windows",
    label: "Windows OCR (Recommended)",
    engine: "windows-media-ocr",
    kind: "local",
    supportsRegions: true,
    setup: "Install the OCR language pack in Windows Settings if this provider is unavailable.",
  },
  {
    id: "paddleocr",
    label: "PaddleOCR",
    engine: "paddleocr-python",
    kind: "local",
    supportsRegions: true,
    setup: "Install Python packages: pip install paddleocr paddlepaddle",
  },
  {
    id: "tesseract",
    label: "Tesseract",
    engine: "tesseract-cli",
    kind: "local",
    supportsRegions: true,
    setup: "Install Tesseract and place traineddata files in the app tessdata directory.",
  },
  {
    id: "easyocr",
    label: "EasyOCR",
    engine: "easyocr-python",
    kind: "local",
    supportsRegions: true,
    setup: "Install Python package: pip install easyocr",
  },
  {
    id: "rapidocr",
    label: "RapidOCR",
    engine: "rapidocr-python",
    kind: "local",
    supportsRegions: true,
    setup: "Install Python package: pip install rapidocr",
  },
  {
    id: "doctr",
    label: "docTR",
    engine: "python-doctr",
    kind: "local",
    supportsRegions: true,
    setup: 'Install Python package: pip install "python-doctr[torch]"',
  },
  {
    id: "manga-ocr",
    label: "Manga OCR",
    engine: "manga-ocr-python",
    kind: "local",
    supportsRegions: true,
    setup: "Install Python package: pip install manga-ocr",
  },
];

function languageHintToWindowsTag(languageHint) {
  const key = String(languageHint ?? "").trim().toLowerCase();
  const map = {
    arabic: "ar",
    ar: "ar",
    chinese: "zh-Hans",
    chinese_simplified: "zh-Hans",
    chinese_traditional: "zh-Hant",
    ch: "zh-Hans",
    english: "en-US",
    en: "en-US",
    japanese: "ja",
    ja: "ja",
    korean: "ko",
    ko: "ko",
  };
  return map[key] ?? "";
}

function languageHintToTesseract(languageHint) {
  const key = String(languageHint ?? "").trim().toLowerCase();
  const map = {
    arabic: "ara",
    ar: "ara",
    chinese: "chi_sim",
    chinese_simplified: "chi_sim",
    chinese_traditional: "chi_tra",
    ch: "chi_sim",
    english: "eng",
    en: "eng",
    japanese: "jpn",
    ja: "jpn",
    korean: "kor",
    ko: "kor",
  };
  return map[key] ?? "eng";
}

function candidateTesseractCommands() {
  return [
    process.env.TESSERACT_CMD,
    "tesseract",
    process.platform === "win32" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Tesseract-OCR", "tesseract.exe") : null,
    process.platform === "win32"
      ? path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Tesseract-OCR", "tesseract.exe")
      : null,
  ].filter(Boolean);
}

async function resolveTesseractCommand() {
  for (const command of candidateTesseractCommands()) {
    if (command === "tesseract") {
      if (await commandExists(command)) return command;
      continue;
    }
    if (!fsSync.existsSync(command)) continue;
    const result = await runProcess(command, ["--version"], { timeoutMs: 8_000 });
    if (result.ok) return command;
  }
  return null;
}

function candidateTessdataDirectories() {
  return [
    process.env.FLORIS_TESSDATA_DIR,
    process.env.TESSDATA_PREFIX,
    RUNTIME_PATHS.tessdataPath,
    process.platform === "win32" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Tesseract-OCR", "tessdata") : null,
    process.platform === "win32"
      ? path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Tesseract-OCR", "tessdata")
      : null,
  ].filter(Boolean);
}

function resolveTessdataDirectory(language = "eng") {
  const candidates = candidateTessdataDirectories();
  for (const directory of candidates) {
    if (!fsSync.existsSync(directory)) continue;
    const hasRequested = fsSync.existsSync(path.join(directory, `${language}.traineddata`));
    const hasEnglish = fsSync.existsSync(path.join(directory, "eng.traineddata"));
    if (hasRequested || hasEnglish) return directory;
  }
  return null;
}

function installedTessdataLanguages(directory) {
  if (!directory || !fsSync.existsSync(directory)) return [];
  return fsSync
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".traineddata"))
    .map((fileName) => path.basename(fileName, ".traineddata"));
}

function normalizeRegion(region, pageWidth, pageHeight) {
  const width = Number(region?.width ?? 0);
  const height = Number(region?.height ?? 0);
  return {
    type: "box",
    x: Math.max(0, Number(region?.x ?? 0)),
    y: Math.max(0, Number(region?.y ?? 0)),
    width: width > 0 ? width : pageWidth,
    height: height > 0 ? height : pageHeight,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaledDimension(value, scale) {
  return Math.max(1, Math.round(Number(value) * scale));
}

function regionCropScale(cropRect) {
  const width = Math.max(1, Number(cropRect?.width ?? 1));
  const height = Math.max(1, Number(cropRect?.height ?? 1));
  const widthScale = REGION_CROP_MIN_WIDTH / width;
  const heightScale = REGION_CROP_MIN_HEIGHT / height;
  const scale = Math.max(1, widthScale, heightScale);
  return Math.min(REGION_CROP_MAX_SCALE, Math.round(scale * 100) / 100);
}

function normalizeCropRect(region, page) {
  const x = clamp(Math.floor(Number(region?.x ?? 0)), 0, Math.max(0, page.width - 1));
  const y = clamp(Math.floor(Number(region?.y ?? 0)), 0, Math.max(0, page.height - 1));
  const right = clamp(
    Math.ceil(Number(region?.x ?? 0) + Number(region?.width ?? page.width)),
    x + 1,
    page.width,
  );
  const bottom = clamp(
    Math.ceil(Number(region?.y ?? 0) + Number(region?.height ?? page.height)),
    y + 1,
    page.height,
  );

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

async function cropWithNativeImage(sourcePath, outputPath, cropRect, scale) {
  let nativeImage;
  try {
    nativeImage = require("electron").nativeImage;
  } catch {
    nativeImage = null;
  }
  if (!nativeImage?.createFromPath) return false;

  const source = nativeImage.createFromPath(sourcePath);
  if (source.isEmpty()) return false;
  let cropped = source.crop(cropRect);
  if (cropped.isEmpty()) return false;

  if (scale > 1) {
    const resized = cropped.resize({
      height: scaledDimension(cropRect.height, scale),
      quality: "best",
      width: scaledDimension(cropRect.width, scale),
    });
    if (!resized.isEmpty()) cropped = resized;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, cropped.toPNG());
  return true;
}

async function cropWithPython(pythonCommand, sourcePath, outputPath, cropRect, scale) {
  const result = await runProcess(
    pythonCommand,
    [
      PYTHON_CROP_SCRIPT,
      "--source",
      sourcePath,
      "--output",
      outputPath,
      "--x",
      String(cropRect.x),
      "--y",
      String(cropRect.y),
      "--width",
      String(cropRect.width),
      "--height",
      String(cropRect.height),
      "--scale",
      String(scale),
      "--autocontrast",
      "--white-background",
    ],
    { env: pythonRuntimeEnv(process.env, RUNTIME_PATHS), timeoutMs: 30_000 },
  );

  return {
    error: result.stderr.trim() || result.stdout.trim() || "Python image crop failed.",
    ok: result.ok,
  };
}

async function cropPageForRegion(page, region, pythonCommand = resolvePythonCommand()) {
  const cropRect = normalizeCropRect(region, page);
  const scale = regionCropScale(cropRect);
  await fs.mkdir(RUNTIME_PATHS.tempRoot, { recursive: true });
  const tempDirectory = await fs.mkdtemp(path.join(RUNTIME_PATHS.tempRoot, "floris-ocr-region-"));
  const outputPath = path.join(tempDirectory, "region.png");

  try {
    let pythonCrop = { error: "", ok: false };
    try {
      pythonCrop = await cropWithPython(pythonCommand, page.imagePath, outputPath, cropRect, scale);
    } catch (error) {
      pythonCrop = { error: error instanceof Error ? error.message : String(error), ok: false };
    }

    if (!pythonCrop.ok) {
      const nativeCropOk = await cropWithNativeImage(page.imagePath, outputPath, cropRect, scale);
      if (!nativeCropOk) {
        throw new Error(
          `Image crop failed. Python/Pillow: ${pythonCrop.error || "not available"}. Electron nativeImage could not crop this image.`,
        );
      }
    }
  } catch (error) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    cleanup: () => fs.rm(tempDirectory, { recursive: true, force: true }),
    cropRect,
    scale,
    page: {
      ...page,
      imagePath: outputPath,
      width: scaledDimension(cropRect.width, scale),
      height: scaledDimension(cropRect.height, scale),
    },
  };
}

function offsetItemsToOriginalPage(items, cropRect, page, scale = 1) {
  const safeScale = Math.max(1, Number(scale) || 1);
  return items.map((item) => ({
    ...item,
    pageId: page.pageId,
    region: normalizeRegion(
      {
        ...item.region,
        height: item.region.height / safeScale,
        width: item.region.width / safeScale,
        x: item.region.x / safeScale + cropRect.x,
        y: item.region.y / safeScale + cropRect.y,
      },
      page.width,
      page.height,
    ),
  }));
}

function regionRight(item) {
  return item.region.x + item.region.width;
}

function regionBottom(item) {
  return item.region.y + item.region.height;
}

function horizontalOverlapRatio(first, second) {
  const overlap = Math.max(
    0,
    Math.min(regionRight(first), regionRight(second)) - Math.max(first.region.x, second.region.x),
  );
  const minWidth = Math.max(1, Math.min(first.region.width, second.region.width));
  return overlap / minWidth;
}

function centerX(item) {
  return item.region.x + item.region.width / 2;
}

function shouldMergeOcrLine(previous, current, page) {
  const verticalGap = current.region.y - regionBottom(previous);
  if (verticalGap < -Math.max(previous.region.height, current.region.height) * 0.35) return false;

  const averageHeight = (previous.region.height + current.region.height) / 2;
  const maxLineGap = Math.max(18, Math.min(54, averageHeight * 1.45));
  if (verticalGap > maxLineGap) return false;

  const centerDistance = Math.abs(centerX(previous) - centerX(current));
  const maxCenterDistance = Math.max(
    42,
    Math.min(page.width * 0.14, Math.max(previous.region.width, current.region.width) * 0.48),
  );
  const overlapRatio = horizontalOverlapRatio(previous, current);

  return overlapRatio >= 0.22 || centerDistance <= maxCenterDistance;
}

function mergeOcrGroup(group, pageId) {
  const left = Math.min(...group.map((item) => item.region.x));
  const top = Math.min(...group.map((item) => item.region.y));
  const right = Math.max(...group.map(regionRight));
  const bottom = Math.max(...group.map(regionBottom));
  const confidenceValues = group
    .map((item) => item.confidence)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  return {
    confidence: confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null,
    pageId,
    providerItemId: group
      .map((item) => item.providerItemId)
      .filter(Boolean)
      .join(",") || null,
    readingOrder: group[0]?.readingOrder ?? 1,
    region: {
      type: "box",
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    },
    text: group.map((item) => item.text).join("\n"),
  };
}

function mergeOcrLines(items, page) {
  if (items.length <= 1) return items;

  const merged = [];
  let currentGroup = [items[0]];

  for (const item of items.slice(1)) {
    const previous = currentGroup[currentGroup.length - 1];
    if (shouldMergeOcrLine(previous, item, page)) {
      currentGroup.push(item);
    } else {
      merged.push(mergeOcrGroup(currentGroup, page.pageId));
      currentGroup = [item];
    }
  }

  merged.push(mergeOcrGroup(currentGroup, page.pageId));
  return merged.map((item, index) => ({ ...item, readingOrder: index + 1 }));
}

function normalizeItems(rawItems, page) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map((item, index) => ({
      confidence: typeof item.confidence === "number" ? item.confidence : null,
      pageId: page.pageId,
      providerItemId: item.id ? String(item.id) : null,
      readingOrder: Number(item.readingOrder ?? index + 1),
      region: normalizeRegion(item.region, page.width, page.height),
      text: String(item.text ?? "").trim(),
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => {
      if (a.readingOrder !== b.readingOrder) return a.readingOrder - b.readingOrder;
      if (Math.abs(a.region.y - b.region.y) > 12) return a.region.y - b.region.y;
      return a.region.x - b.region.x;
    });

  return mergeOcrLines(items, page);
}

function combinedOcrText(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item.text ?? ""))
    .join("\n")
    .trim();
}

function isEnglishLanguageHint(languageHint) {
  const key = String(languageHint ?? "").trim().toLowerCase();
  return key === "english" || key === "en" || key === "en-us";
}

function windowsOcrSuspicionScore(items) {
  const text = combinedOcrText(items);
  if (!text) return 30;

  const words = text.match(/[^\s]+/g) ?? [];
  let score = 0;
  const replacementMatches = text.match(/[�æÆ]/g) ?? [];
  const symbolMatches = text.match(/[$]/g) ?? [];
  const slashMatches = text.match(/\//g) ?? [];
  score += replacementMatches.length * 12;
  score += symbolMatches.length * 8;
  score += slashMatches.length * 3;

  for (const word of words) {
    const hasLetter = /[A-Za-z]/.test(word);
    if (!hasLetter) continue;
    if (/[�æÆ$]/.test(word)) score += 10;
    if (/[A-Za-z]\d|\d[A-Za-z]/.test(word)) score += 7;
    if (/[A-Za-z]\/|\/[A-Za-z]/.test(word)) score += 6;
    if (/[A-Z]{2,}5[A-Z5]{1,}/.test(word)) score += 8;
  }

  return score;
}

function ocrQualityScore(items) {
  const text = combinedOcrText(items);
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const spaces = (text.match(/\s/g) ?? []).length;
  const confidenceValues = (Array.isArray(items) ? items : [])
    .map((item) => item.confidence)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const confidenceBonus = confidenceValues.length > 0
    ? (confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 20
    : 0;

  return letters + spaces * 0.2 + confidenceBonus - windowsOcrSuspicionScore(items) * 2;
}

function shouldRetryWindowsOcr(items, languageHint) {
  if (process.env.FLORIS_WINDOWS_OCR_FALLBACK === "0") return false;
  if (!isEnglishLanguageHint(languageHint)) return false;
  const text = combinedOcrText(items);
  if (!text) return true;
  const words = text.match(/[^\s]+/g) ?? [];
  const suspicion = windowsOcrSuspicionScore(items);
  return suspicion >= 14 || (words.length > 0 && suspicion / words.length >= 2.2);
}

function shouldUseOcrFallback(primaryItems, fallbackItems) {
  if (!Array.isArray(fallbackItems) || fallbackItems.length === 0) return false;
  if (!Array.isArray(primaryItems) || primaryItems.length === 0) return true;

  const primarySuspicion = windowsOcrSuspicionScore(primaryItems);
  const fallbackSuspicion = windowsOcrSuspicionScore(fallbackItems);
  if (fallbackSuspicion + 8 < primarySuspicion) return true;

  return ocrQualityScore(fallbackItems) > ocrQualityScore(primaryItems) + 10;
}

function parseJsonOutput(result, providerId) {
  const output = result.stdout.trim();
  if (!result.ok) {
    const detail = result.stderr.trim() || output || `${providerId} exited with ${result.code}`;
    throw new Error(detail);
  }

  const jsonCandidate = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}")) ?? output;

  try {
    return JSON.parse(jsonCandidate || "{}");
  } catch (error) {
    throw new Error(`${providerId} returned invalid JSON: ${error.message}`);
  }
}

function parseTesseractTsv(tsv, page) {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return [];

  const columns = header.split("\t");
  const indexOf = (name) => columns.indexOf(name);
  const required = ["level", "block_num", "par_num", "line_num", "left", "top", "width", "height", "conf", "text"];
  if (required.some((name) => indexOf(name) === -1)) return [];

  const groups = new Map();
  for (const line of lines) {
    const values = line.split("\t");
    const text = values[indexOf("text")]?.trim();
    if (!text) continue;
    const groupKey = [
      values[indexOf("block_num")],
      values[indexOf("par_num")],
      values[indexOf("line_num")],
    ].join(":");
    const left = Number(values[indexOf("left")] ?? 0);
    const top = Number(values[indexOf("top")] ?? 0);
    const width = Number(values[indexOf("width")] ?? 0);
    const height = Number(values[indexOf("height")] ?? 0);
    const conf = Number(values[indexOf("conf")] ?? -1);
    const group = groups.get(groupKey) ?? {
      confidenceValues: [],
      left,
      right: left + width,
      textParts: [],
      top,
      bottom: top + height,
    };

    group.left = Math.min(group.left, left);
    group.top = Math.min(group.top, top);
    group.right = Math.max(group.right, left + width);
    group.bottom = Math.max(group.bottom, top + height);
    group.textParts.push(text);
    if (Number.isFinite(conf) && conf >= 0) group.confidenceValues.push(conf / 100);
    groups.set(groupKey, group);
  }

  return Array.from(groups.values()).map((group, index) => {
    const confidence =
      group.confidenceValues.length > 0
        ? group.confidenceValues.reduce((sum, value) => sum + value, 0) / group.confidenceValues.length
        : null;
    return {
      confidence,
      pageId: page.pageId,
      readingOrder: index + 1,
      region: {
        type: "box",
        x: group.left,
        y: group.top,
        width: Math.max(1, group.right - group.left),
        height: Math.max(1, group.bottom - group.top),
      },
      text: group.textParts.join(" "),
    };
  });
}

async function checkPythonImport(moduleName) {
  const python = resolvePythonCommand();
  const result = await runProcess(
    python,
    [
      "-c",
      `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`,
    ],
    { env: pythonRuntimeEnv(process.env, RUNTIME_PATHS), timeoutMs: 8_000 },
  );
  return result.ok;
}

async function checkPythonImportAny(moduleNames) {
  for (const moduleName of moduleNames) {
    if (await checkPythonImport(moduleName)) return true;
  }
  return false;
}

class OcrProviderRegistry {
  constructor(options = {}) {
    this.pythonCommand = options.pythonCommand || resolvePythonCommand();
  }

  providerMetadata() {
    return OCR_PROVIDERS;
  }

  getProvider(providerId) {
    return OCR_PROVIDERS.find((provider) => provider.id === providerId);
  }

  async listProviderStatuses(languageHint = "") {
    const statuses = [];
    for (const provider of OCR_PROVIDERS) {
      statuses.push(await this.getProviderStatus(provider.id, languageHint));
    }
    return statuses;
  }

  async getProviderStatus(providerId, languageHint = "") {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Unknown OCR provider: ${providerId}`);

    try {
      if (providerId === "windows") {
        if (process.platform !== "win32") {
          return { ...provider, available: false, reason: "Windows OCR only runs on Windows." };
        }
        const args = [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          WINDOWS_OCR_SCRIPT,
          "-Check",
        ];
        const tag = languageHintToWindowsTag(languageHint);
        if (tag) args.push("-LanguageTag", tag);
        const result = await runProcess("powershell.exe", args, {
          env: pythonRuntimeEnv(process.env, RUNTIME_PATHS),
          timeoutMs: 8_000,
        });
        return {
          ...provider,
          available: result.ok,
          reason: result.ok ? null : result.stderr.trim() || result.stdout.trim() || "Windows OCR check failed.",
        };
      }

      if (providerId === "tesseract") {
        const command = await resolveTesseractCommand();
        const tessdataDirectory = resolveTessdataDirectory("eng");
        const languages = installedTessdataLanguages(tessdataDirectory);
        const hasRequiredLanguages = DEFAULT_TESSDATA_LANGUAGES.every((language) => languages.includes(language));
        const available = Boolean(command && tessdataDirectory && hasRequiredLanguages);
        return {
          ...provider,
          available,
          reason: available
            ? null
            : command
              ? `Missing Tesseract traineddata: ${DEFAULT_TESSDATA_LANGUAGES.filter((language) => !languages.includes(language)).join(", ")}`
              : provider.setup,
        };
      }

      if (providerId === "paddleocr") {
        const available = await checkPythonImport("paddleocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "easyocr") {
        const available = await checkPythonImport("easyocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "rapidocr") {
        const available = await checkPythonImportAny(["rapidocr", "rapidocr_onnxruntime"]);
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "doctr") {
        const available = await checkPythonImport("doctr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "manga-ocr") {
        const available = await checkPythonImport("manga_ocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }
    } catch (error) {
      return {
        ...provider,
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    return { ...provider, available: false, reason: provider.setup };
  }

  async isPythonProviderAvailable(providerId) {
    if (providerId === "paddleocr") return checkPythonImport("paddleocr");
    if (providerId === "doctr") return checkPythonImport("doctr");
    if (providerId === "easyocr") return checkPythonImport("easyocr");
    if (providerId === "rapidocr") return checkPythonImportAny(["rapidocr", "rapidocr_onnxruntime"]);
    if (providerId === "manga-ocr") return checkPythonImport("manga_ocr");
    return false;
  }

  async runWindowsFallbackProvider(page, options, primaryResult) {
    for (const providerId of WINDOWS_OCR_FALLBACK_PROVIDERS) {
      try {
        if (!(await this.isPythonProviderAvailable(providerId))) continue;
        const fallbackResult = await this.runPythonProvider(providerId, page, options);
        if (shouldUseOcrFallback(primaryResult.items, fallbackResult.items)) {
          return {
            ...fallbackResult,
            fallbackFromProviderId: "windows",
            languageDetected: primaryResult.languageDetected ?? fallbackResult.languageDetected,
            providerId,
          };
        }
      } catch {
        // Try the next local provider. The original Windows result remains the fallback.
      }
    }

    return null;
  }

  async recognizePage(providerId, page, options = {}) {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Unknown OCR provider: ${providerId}`);
    if (providerId === "windows") return this.runWindowsOcr(page, options);
    if (providerId === "tesseract") return this.runTesseract(page, options);
    if (
      providerId === "paddleocr" ||
      providerId === "easyocr" ||
      providerId === "rapidocr" ||
      providerId === "doctr" ||
      providerId === "manga-ocr"
    ) {
      return this.runPythonProvider(providerId, page, options);
    }
    throw new Error(`OCR provider is not implemented: ${providerId}`);
  }

  async recognizeRegion(providerId, page, region, options = {}) {
    const cropped = await cropPageForRegion(page, region, this.pythonCommand);
    try {
      const result = await this.recognizePage(providerId, cropped.page, options);
      return {
        cropRect: cropped.cropRect,
        fallbackFromProviderId: result.fallbackFromProviderId,
        languageDetected: result.languageDetected,
        items: offsetItemsToOriginalPage(result.items, cropped.cropRect, page, cropped.scale),
        providerId: result.providerId,
      };
    } finally {
      await cropped.cleanup();
    }
  }

  async runWindowsOcr(page, options) {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WINDOWS_OCR_SCRIPT,
      "-ImagePath",
      page.imagePath,
    ];
    const tag = languageHintToWindowsTag(options.languageHint);
    if (tag) args.push("-LanguageTag", tag);
    const result = await runProcess("powershell.exe", args, {
      env: pythonRuntimeEnv(process.env, RUNTIME_PATHS),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const payload = parseJsonOutput(result, "windows");
    const primaryResult = {
      languageDetected: payload.languageDetected ?? tag ?? null,
      items: normalizeItems(payload.items, page),
      providerId: "windows",
    };

    if (shouldRetryWindowsOcr(primaryResult.items, options.languageHint)) {
      const fallbackResult = await this.runWindowsFallbackProvider(page, options, primaryResult);
      if (fallbackResult) return fallbackResult;
    }

    return primaryResult;
  }

  async runPythonProvider(providerId, page, options) {
    const result = await runProcess(
      this.pythonCommand,
      [
        PYTHON_BRIDGE,
        "--provider",
        providerId,
        "--image",
        page.imagePath,
        "--language",
        options.languageHint ?? "",
        "--page-width",
        String(page.width),
        "--page-height",
        String(page.height),
      ],
      { env: pythonRuntimeEnv(process.env, RUNTIME_PATHS), timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );
    const payload = parseJsonOutput(result, providerId);
    return {
      languageDetected: options.languageHint ?? null,
      items: normalizeItems(payload.items, page),
      providerId,
    };
  }

  async runTesseract(page, options) {
    const command = await resolveTesseractCommand();
    if (!command) throw new Error("Tesseract is not installed.");
    const language = languageHintToTesseract(options.languageHint);
    const tessdataDirectory = resolveTessdataDirectory(language);
    const args = [
      page.imagePath,
      "stdout",
      "-l",
      language,
      "--psm",
      "6",
      "-c",
      "tessedit_create_tsv=1",
    ];
    if (tessdataDirectory) args.splice(2, 0, "--tessdata-dir", tessdataDirectory);
    const result = await runProcess(
      command,
      args,
      { env: pythonRuntimeEnv(process.env, RUNTIME_PATHS), timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );
    if (!result.ok) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "Tesseract failed.");
    }
    return {
      languageDetected: language,
      items: normalizeItems(parseTesseractTsv(result.stdout, page), page),
      providerId: "tesseract",
    };
  }
}

function resolvePythonCommand() {
  if (process.env.FLORIS_PYTHON) return process.env.FLORIS_PYTHON;
  if (fsSync.existsSync(DEFAULT_OCR_PYTHON)) return DEFAULT_OCR_PYTHON;
  return "python";
}

module.exports = {
  OcrProviderRegistry,
  OCR_PROVIDERS,
};
