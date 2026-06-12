const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { nativeImage } = require("electron");
const { PAGE_CACHE_HOST } = require("../data/chapter-page-store.cjs");
const { COVER_CACHE_SCHEME } = require("../data/cover-cache.cjs");
const { getRuntimePaths, pythonRuntimeEnv } = require("../runtime-paths.cjs");

const execFileAsync = promisify(execFile);
const RUNTIME_PATHS = getRuntimePaths();
const SAMPLE_COLOR_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "sample-color.py");
const DEFAULT_OCR_PYTHON = path.join(RUNTIME_PATHS.repoRoot, ".venv-ocr", "Scripts", "python.exe");

function resolvePythonCommand() {
  if (process.env.FLORIS_PYTHON) return process.env.FLORIS_PYTHON;
  if (fs.existsSync(DEFAULT_OCR_PYTHON)) return DEFAULT_OCR_PYTHON;
  return "python";
}

function assertInsideWorkspace(workspacePath, candidatePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(candidatePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Page image path escaped the workspace directory");
  }
  return resolved;
}

function localPathFromPageAsset(workspacePath, assetPath) {
  if (!assetPath || !assetPath.startsWith(`${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/`)) {
    throw new Error("Color picker requires a local cached page image");
  }

  const url = new URL(assetPath);
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  return assertInsideWorkspace(workspacePath, path.join(workspacePath, relativePath));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizePoint(input, page) {
  const x = Number(input?.x ?? 0);
  const y = Number(input?.y ?? 0);
  return {
    x: clamp(Number.isFinite(x) ? x : 0, 0, Number(page.width ?? 1)),
    y: clamp(Number.isFinite(y) ? y : 0, 0, Number(page.height ?? 1)),
  };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

async function sampleWithPython({ imagePath, page, point, pythonCommand }) {
  const { stdout } = await execFileAsync(
    pythonCommand,
    [
      SAMPLE_COLOR_SCRIPT,
      imagePath,
      String(point.x),
      String(point.y),
      String(page.width),
      String(page.height),
    ],
    {
      env: pythonRuntimeEnv(process.env, RUNTIME_PATHS),
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  const parsed = JSON.parse(String(stdout || "{}"));
  if (!/^#[0-9A-F]{6}$/i.test(String(parsed.color ?? ""))) {
    throw new Error("Color sampler returned an invalid color");
  }
  return {
    color: String(parsed.color).toUpperCase(),
    engine: "pillow",
    pixelX: Number(parsed.pixelX ?? 0),
    pixelY: Number(parsed.pixelY ?? 0),
  };
}

function sampleWithNativeImage({ imagePath, page, point }) {
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    throw new Error("Electron could not decode this page image");
  }

  const size = image.getSize(1);
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  const expectedBytes = size.width * size.height * 4;
  if (bitmap.length < expectedBytes || size.width <= 0 || size.height <= 0) {
    throw new Error("Electron returned invalid page bitmap data");
  }

  const pixelX = clamp(Math.round((point.x / Math.max(1, page.width)) * (size.width - 1)), 0, size.width - 1);
  const pixelY = clamp(Math.round((point.y / Math.max(1, page.height)) * (size.height - 1)), 0, size.height - 1);
  const offset = (pixelY * size.width + pixelX) * 4;
  const blue = bitmap[offset];
  const green = bitmap[offset + 1];
  const red = bitmap[offset + 2];

  return {
    color: rgbToHex(red, green, blue),
    engine: "native-image",
    pixelX,
    pixelY,
  };
}

class PageColorService {
  constructor(db, options = {}) {
    this.db = db;
    this.workspacePath = options.workspacePath;
    this.pythonCommand = options.pythonCommand || resolvePythonCommand();
  }

  getPage(pageId) {
    const row = this.db.prepare(`
      SELECT
        p.id AS page_id,
        p.chapter_id,
        COALESCE(p.width, a.width, 820) AS width,
        COALESCE(p.height, a.height, 1240) AS height,
        a.path AS asset_path
      FROM pages p
      JOIN assets a ON a.id = p.asset_id
      WHERE p.id = ?
    `).get(String(pageId ?? ""));

    if (!row) throw new Error(`Page not found: ${pageId}`);
    if (!this.workspacePath) throw new Error("Color picker workspace path is not configured");

    const imagePath = localPathFromPageAsset(this.workspacePath, row.asset_path);
    if (!fs.existsSync(imagePath)) {
      throw new Error("Page image file was not found on disk");
    }

    return {
      assetPath: row.asset_path,
      chapterId: row.chapter_id,
      imagePath,
      pageId: row.page_id,
      width: Number(row.width ?? 820),
      height: Number(row.height ?? 1240),
    };
  }

  async samplePageColor(pageId, input) {
    const page = this.getPage(pageId);
    const point = normalizePoint(input, page);

    try {
      return await sampleWithPython({
        imagePath: page.imagePath,
        page,
        point,
        pythonCommand: this.pythonCommand,
      });
    } catch (pythonError) {
      const nativeResult = sampleWithNativeImage({ imagePath: page.imagePath, page, point });
      return {
        ...nativeResult,
        fallbackReason: pythonError instanceof Error ? pythonError.message : String(pythonError),
      };
    }
  }
}

module.exports = {
  PageColorService,
};
