const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { PAGE_CACHE_HOST } = require("../data/chapter-page-store.cjs");
const { COVER_CACHE_SCHEME, sanitizeFilePart } = require("../data/cover-cache.cjs");

const execFileAsync = promisify(execFile);
const SMART_CLEAN_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "smart-clean-text.py");

function assertInsideWorkspace(workspacePath, candidatePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(candidatePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Clean patch path escaped the workspace directory");
  }
  return resolved;
}

function localPathFromPageAsset(workspacePath, assetPath) {
  if (!assetPath || !assetPath.startsWith(`${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/`)) {
    throw new Error("Smart clean requires a local cached page image");
  }

  const url = new URL(assetPath);
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  return assertInsideWorkspace(workspacePath, path.join(workspacePath, relativePath));
}

function encodePathParts(parts) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function pageCacheUrl(relativePath) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  return `${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/${encodePathParts(parts)}`;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function cleanPatchId() {
  return `page_clean_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeMethod(value) {
  return String(value ?? "telea").toLowerCase() === "ns" ? "ns" : "telea";
}

function normalizeRegion(region, page) {
  const pageWidth = Number(page.width ?? 820);
  const pageHeight = Number(page.height ?? 1240);
  const rawX = Number(region?.x ?? 0);
  const rawY = Number(region?.y ?? 0);
  const rawWidth = Number(region?.width ?? pageWidth);
  const rawHeight = Number(region?.height ?? pageHeight);

  const width = clamp(Number.isFinite(rawWidth) ? rawWidth : pageWidth, 8, pageWidth);
  const height = clamp(Number.isFinite(rawHeight) ? rawHeight : pageHeight, 8, pageHeight);
  const x = clamp(Number.isFinite(rawX) ? rawX : 0, 0, Math.max(0, pageWidth - width));
  const y = clamp(Number.isFinite(rawY) ? rawY : 0, 0, Math.max(0, pageHeight - height));

  return {
    type: "box",
    x: roundCoordinate(x),
    y: roundCoordinate(y),
    width: roundCoordinate(width),
    height: roundCoordinate(height),
  };
}

function mapCleanPatchRow(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageId: row.page_id,
    kind: "clean_patch",
    method: row.method,
    maskExpansion: Number(row.mask_expansion ?? 4),
    feather: Number(row.feather ?? 2),
    opacity: Number(row.opacity ?? 1),
    patchUrl: row.patch_path,
    region: JSON.parse(row.region_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class PageCleanService {
  constructor(db, options = {}) {
    this.db = db;
    this.workspacePath = options.workspacePath;
    this.pythonCommand = options.pythonCommand || process.env.FLORIS_PYTHON || "python";
  }

  getPage(pageId) {
    const row = this.db.prepare(`
      SELECT
        p.id AS page_id,
        p.chapter_id,
        c.project_id,
        COALESCE(p.width, a.width, 820) AS width,
        COALESCE(p.height, a.height, 1240) AS height,
        a.path AS asset_path
      FROM pages p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN assets a ON a.id = p.asset_id
      WHERE p.id = ?
    `).get(String(pageId ?? ""));

    if (!row) throw new Error(`Page not found: ${pageId}`);
    if (!this.workspacePath) throw new Error("Smart clean workspace path is not configured");

    const imagePath = localPathFromPageAsset(this.workspacePath, row.asset_path);
    if (!fs.existsSync(imagePath)) {
      throw new Error("Page image file was not found on disk");
    }

    return {
      assetPath: row.asset_path,
      chapterId: row.chapter_id,
      imagePath,
      pageId: row.page_id,
      projectId: row.project_id,
      width: Number(row.width ?? 820),
      height: Number(row.height ?? 1240),
    };
  }

  async cleanText(pageId, input) {
    const page = this.getPage(pageId);
    const region = normalizeRegion(input?.region, page);
    const method = normalizeMethod(input?.method);
    const maskExpansion = Math.round(clamp(Number(input?.maskExpansion ?? 4), 0, 18));
    const feather = Math.round(clamp(Number(input?.feather ?? 2), 0, 16));
    const id = cleanPatchId();
    const timestamp = new Date().toISOString();
    const relativePath = path
      .join(
        "projects",
        sanitizeFilePart(page.projectId),
        "chapters",
        sanitizeFilePart(page.chapterId),
        "edits",
        `${id}.png`,
      )
      .replace(/\\/g, "/");
    const outputPath = assertInsideWorkspace(this.workspacePath, path.join(this.workspacePath, relativePath));
    const patchUrl = pageCacheUrl(relativePath);

    const { stdout } = await execFileAsync(
      this.pythonCommand,
      [
        SMART_CLEAN_SCRIPT,
        page.imagePath,
        outputPath,
        String(region.x),
        String(region.y),
        String(region.width),
        String(region.height),
        String(page.width),
        String(page.height),
        String(maskExpansion),
        String(feather),
        method,
      ],
      {
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );

    let metadata = {};
    try {
      metadata = JSON.parse(String(stdout || "{}"));
    } catch {
      metadata = {};
    }

    await fsp.stat(outputPath);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO page_clean_patches (
          id, chapter_id, page_id, region_json, patch_path, method,
          mask_expansion, feather, opacity, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        page.chapterId,
        page.pageId,
        JSON.stringify(region),
        patchUrl,
        method,
        maskExpansion,
        feather,
        1,
        timestamp,
        timestamp,
      );
      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, page.chapterId);
      this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, page.projectId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ...mapCleanPatchRow({
        id,
        chapter_id: page.chapterId,
        page_id: page.pageId,
        region_json: JSON.stringify(region),
        patch_path: patchUrl,
        method,
        mask_expansion: maskExpansion,
        feather,
        opacity: 1,
        created_at: timestamp,
        updated_at: timestamp,
      }),
      metadata,
    };
  }
}

module.exports = {
  PageCleanService,
};
