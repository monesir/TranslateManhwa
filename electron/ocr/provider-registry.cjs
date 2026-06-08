const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { commandExists, runProcess } = require("./process-utils.cjs");

const PYTHON_BRIDGE = path.join(__dirname, "python_ocr_bridge.py");
const PYTHON_CROP_SCRIPT = path.join(__dirname, "scripts", "crop-image.py");
const CROP_IMAGE_SCRIPT = path.join(__dirname, "scripts", "crop-image.ps1");
const WINDOWS_OCR_SCRIPT = path.join(__dirname, "scripts", "windows-ocr.ps1");
const DEFAULT_TIMEOUT_MS = 120_000;

const OCR_PROVIDERS = [
  {
    id: "windows",
    label: "Windows OCR",
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
    setup: "Install Tesseract and put tesseract.exe on PATH.",
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
    id: "manga-ocr",
    label: "Manga OCR",
    engine: "manga-ocr-python",
    kind: "local",
    supportsRegions: true,
    setup: "Install Python package: pip install manga-ocr",
  },
  {
    id: "azure-read",
    label: "Azure AI Vision Read",
    engine: "azure-computer-vision-read",
    kind: "cloud",
    supportsRegions: true,
    setup: "Set AZURE_AI_VISION_ENDPOINT and AZURE_AI_VISION_KEY environment variables.",
  },
  {
    id: "google-vision",
    label: "Google Cloud Vision",
    engine: "google-cloud-vision-rest",
    kind: "cloud",
    supportsRegions: true,
    setup: "Set GOOGLE_CLOUD_VISION_API_KEY environment variable.",
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

function languageHintToAzure(languageHint) {
  const key = String(languageHint ?? "").trim().toLowerCase();
  const map = {
    arabic: "ar",
    ar: "ar",
    chinese: "zh-Hans",
    chinese_simplified: "zh-Hans",
    chinese_traditional: "zh-Hant",
    english: "en",
    en: "en",
    japanese: "ja",
    ja: "ja",
    korean: "ko",
    ko: "ko",
  };
  return map[key] ?? "";
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

async function cropWithNativeImage(sourcePath, outputPath, cropRect) {
  let nativeImage;
  try {
    nativeImage = require("electron").nativeImage;
  } catch {
    nativeImage = null;
  }
  if (!nativeImage?.createFromPath) return false;

  const source = nativeImage.createFromPath(sourcePath);
  if (source.isEmpty()) return false;
  const cropped = source.crop(cropRect);
  if (cropped.isEmpty()) return false;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, cropped.toPNG());
  return true;
}

async function cropWithPowerShell(sourcePath, outputPath, cropRect) {
  const result = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      CROP_IMAGE_SCRIPT,
      "-SourcePath",
      sourcePath,
      "-OutputPath",
      outputPath,
      "-X",
      String(cropRect.x),
      "-Y",
      String(cropRect.y),
      "-Width",
      String(cropRect.width),
      "-Height",
      String(cropRect.height),
    ],
    { timeoutMs: 30_000 },
  );
  if (!result.ok) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Image crop failed.");
  }
}

async function cropWithPython(pythonCommand, sourcePath, outputPath, cropRect) {
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
    ],
    { timeoutMs: 30_000 },
  );

  return {
    error: result.stderr.trim() || result.stdout.trim() || "Python image crop failed.",
    ok: result.ok,
  };
}

async function cropPageForRegion(page, region, pythonCommand = process.env.FLORIS_PYTHON || "python") {
  const cropRect = normalizeCropRect(region, page);
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "floris-ocr-region-"));
  const outputPath = path.join(tempDirectory, "region.png");

  try {
    const nativeCropOk = await cropWithNativeImage(page.imagePath, outputPath, cropRect);
    if (!nativeCropOk) {
      let pythonCrop = { error: "", ok: false };
      try {
        pythonCrop = await cropWithPython(pythonCommand, page.imagePath, outputPath, cropRect);
      } catch (error) {
        pythonCrop = { error: error instanceof Error ? error.message : String(error), ok: false };
      }

      if (!pythonCrop.ok) {
        try {
          await cropWithPowerShell(page.imagePath, outputPath, cropRect);
        } catch (error) {
          const powerShellError = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Image crop failed. Python: ${pythonCrop.error || "not available"}. PowerShell: ${powerShellError}`,
          );
        }
      }
    }
  } catch (error) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    cleanup: () => fs.rm(tempDirectory, { recursive: true, force: true }),
    cropRect,
    page: {
      ...page,
      imagePath: outputPath,
      width: cropRect.width,
      height: cropRect.height,
    },
  };
}

function offsetItemsToOriginalPage(items, cropRect, page) {
  return items.map((item) => ({
    ...item,
    pageId: page.pageId,
    region: normalizeRegion(
      {
        ...item.region,
        x: item.region.x + cropRect.x,
        y: item.region.y + cropRect.y,
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

function parseJsonOutput(result, providerId) {
  const output = result.stdout.trim();
  if (!result.ok) {
    const detail = result.stderr.trim() || output || `${providerId} exited with ${result.code}`;
    throw new Error(detail);
  }

  try {
    return JSON.parse(output || "{}");
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

function regionFromPolygonValues(values, page) {
  const xs = [];
  const ys = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    xs.push(Number(values[index]));
    ys.push(Number(values[index + 1]));
  }
  if (xs.length === 0) {
    return { type: "box", x: 0, y: 0, width: page.width, height: page.height };
  }
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.max(minX + 1, Math.max(...xs));
  const maxY = Math.max(minY + 1, Math.max(...ys));
  return { type: "box", x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function parseAzureReadResult(payload, page) {
  const items = [];
  for (const readPage of payload?.analyzeResult?.readResults ?? []) {
    for (const [index, line] of (readPage.lines ?? []).entries()) {
      const wordConfidences = (line.words ?? [])
        .map((word) => Number(word.confidence))
        .filter((value) => Number.isFinite(value));
      const confidence =
        wordConfidences.length > 0
          ? wordConfidences.reduce((sum, value) => sum + value, 0) / wordConfidences.length
          : null;
      items.push({
        confidence,
        pageId: page.pageId,
        readingOrder: index + 1,
        region: regionFromPolygonValues(line.boundingBox ?? [], page),
        text: String(line.text ?? "").trim(),
      });
    }
  }
  return items.filter((item) => item.text);
}

function regionFromGoogleVertices(vertices, page) {
  if (!Array.isArray(vertices) || vertices.length === 0) {
    return { type: "box", x: 0, y: 0, width: page.width, height: page.height };
  }
  const xs = vertices.map((vertex) => Number(vertex.x ?? 0));
  const ys = vertices.map((vertex) => Number(vertex.y ?? 0));
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.max(minX + 1, Math.max(...xs));
  const maxY = Math.max(minY + 1, Math.max(...ys));
  return { type: "box", x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function parseGoogleVisionResult(payload, page) {
  const annotations = payload?.responses?.[0]?.textAnnotations ?? [];
  return annotations.slice(1).map((annotation, index) => ({
    confidence: null,
    pageId: page.pageId,
    readingOrder: index + 1,
    region: regionFromGoogleVertices(annotation.boundingPoly?.vertices, page),
    text: String(annotation.description ?? "").trim(),
  })).filter((item) => item.text);
}

async function checkPythonImport(moduleName) {
  const python = process.env.FLORIS_PYTHON || "python";
  const result = await runProcess(
    python,
    [
      "-c",
      `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`,
    ],
    { timeoutMs: 8_000 },
  );
  return result.ok;
}

class OcrProviderRegistry {
  constructor(options = {}) {
    this.pythonCommand = options.pythonCommand || process.env.FLORIS_PYTHON || "python";
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
        const result = await runProcess("powershell.exe", args, { timeoutMs: 8_000 });
        return {
          ...provider,
          available: result.ok,
          reason: result.ok ? null : result.stderr.trim() || result.stdout.trim() || "Windows OCR check failed.",
        };
      }

      if (providerId === "tesseract") {
        const available = await commandExists("tesseract");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "paddleocr") {
        const available = await checkPythonImport("paddleocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "easyocr") {
        const available = await checkPythonImport("easyocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "manga-ocr") {
        const available = await checkPythonImport("manga_ocr");
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "azure-read") {
        const available = Boolean(
          (process.env.AZURE_AI_VISION_ENDPOINT || process.env.AZURE_VISION_ENDPOINT) &&
          (process.env.AZURE_AI_VISION_KEY || process.env.AZURE_VISION_KEY),
        );
        return { ...provider, available, reason: available ? null : provider.setup };
      }

      if (providerId === "google-vision") {
        const available = Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY);
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

  async recognizePage(providerId, page, options = {}) {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Unknown OCR provider: ${providerId}`);
    if (providerId === "windows") return this.runWindowsOcr(page, options);
    if (providerId === "tesseract") return this.runTesseract(page, options);
    if (providerId === "paddleocr" || providerId === "easyocr" || providerId === "manga-ocr") {
      return this.runPythonProvider(providerId, page, options);
    }
    if (providerId === "azure-read") return this.runAzureRead(page, options);
    if (providerId === "google-vision") return this.runGoogleVision(page);
    throw new Error(`OCR provider is not implemented: ${providerId}`);
  }

  async recognizeRegion(providerId, page, region, options = {}) {
    const cropped = await cropPageForRegion(page, region, this.pythonCommand);
    try {
      const result = await this.recognizePage(providerId, cropped.page, options);
      return {
        cropRect: cropped.cropRect,
        languageDetected: result.languageDetected,
        items: offsetItemsToOriginalPage(result.items, cropped.cropRect, page),
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
    const result = await runProcess("powershell.exe", args, { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    const payload = parseJsonOutput(result, "windows");
    return {
      languageDetected: payload.languageDetected ?? tag ?? null,
      items: normalizeItems(payload.items, page),
    };
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
      { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );
    const payload = parseJsonOutput(result, providerId);
    return {
      languageDetected: options.languageHint ?? null,
      items: normalizeItems(payload.items, page),
    };
  }

  async runTesseract(page, options) {
    const language = languageHintToTesseract(options.languageHint);
    const result = await runProcess(
      "tesseract",
      [page.imagePath, "stdout", "-l", language, "--psm", "6", "tsv"],
      { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    );
    if (!result.ok) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "Tesseract failed.");
    }
    return {
      languageDetected: language,
      items: normalizeItems(parseTesseractTsv(result.stdout, page), page),
    };
  }

  async runAzureRead(page, options) {
    const endpoint = (process.env.AZURE_AI_VISION_ENDPOINT || process.env.AZURE_VISION_ENDPOINT || "").replace(/\/+$/, "");
    const key = process.env.AZURE_AI_VISION_KEY || process.env.AZURE_VISION_KEY;
    if (!endpoint || !key) throw new Error("Azure Vision endpoint/key are not configured.");

    const language = languageHintToAzure(options.languageHint);
    const query = language ? `?language=${encodeURIComponent(language)}` : "";
    const imageBytes = await fs.readFile(page.imagePath);
    const analyze = await fetch(`${endpoint}/vision/v3.2/read/analyze${query}`, {
      body: imageBytes,
      headers: {
        "Content-Type": "application/octet-stream",
        "Ocp-Apim-Subscription-Key": key,
      },
      method: "POST",
    });
    if (!analyze.ok) {
      throw new Error(`Azure Read request failed: ${analyze.status} ${await analyze.text()}`);
    }

    const operationLocation = analyze.headers.get("operation-location");
    if (!operationLocation) throw new Error("Azure Read did not return an operation-location header.");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const poll = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      if (!poll.ok) throw new Error(`Azure Read polling failed: ${poll.status} ${await poll.text()}`);
      const payload = await poll.json();
      if (payload.status === "succeeded") {
        return {
          languageDetected: language || null,
          items: normalizeItems(parseAzureReadResult(payload, page), page),
        };
      }
      if (payload.status === "failed") {
        throw new Error("Azure Read failed to analyze the image.");
      }
    }

    throw new Error("Azure Read timed out while polling OCR result.");
  }

  async runGoogleVision(page) {
    const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!key) throw new Error("GOOGLE_CLOUD_VISION_API_KEY is not configured.");

    const imageBytes = await fs.readFile(page.imagePath);
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
      body: JSON.stringify({
        requests: [
          {
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            image: { content: imageBytes.toString("base64") },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Google Vision request failed: ${response.status} ${await response.text()}`);
    const payload = await response.json();
    const error = payload?.responses?.[0]?.error;
    if (error) throw new Error(error.message ?? "Google Vision failed.");

    return {
      languageDetected: null,
      items: normalizeItems(parseGoogleVisionResult(payload, page), page),
    };
  }
}

module.exports = {
  OcrProviderRegistry,
  OCR_PROVIDERS,
};
