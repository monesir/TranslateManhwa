const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { PAGE_CACHE_HOST } = require("../data/chapter-page-store.cjs");
const { COVER_CACHE_SCHEME, sanitizeFilePart } = require("../data/cover-cache.cjs");

const execFileAsync = promisify(execFile);
const SMART_CLEAN_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "smart-clean-text.py");
const RESTORE_CLEAN_PATCH_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "restore-clean-patch.py");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LAMA_PYTHON = path.join(REPO_ROOT, ".venv-lama", "Scripts", "python.exe");

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

function normalizeProvider(value, method) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["algorithm", "bubble_fill", "free_text_inpaint", "opencv_telea", "opencv_ns", "lama", "diffusion"].includes(normalized)) {
    return normalized;
  }
  return method === "ns" ? "opencv_ns" : "opencv_telea";
}

function resolveProviderPython(provider, fallbackPython) {
  if (provider !== "lama") return fallbackPython;

  const candidate = process.env.FLORIS_LAMA_PYTHON || DEFAULT_LAMA_PYTHON;
  if (fs.existsSync(candidate)) return candidate;

  throw new Error(
    `LaMa is not installed. Expected Python at ${candidate}. ` +
      "Create it with: python -m venv --system-site-packages .venv-lama; " +
      ".\\.venv-lama\\Scripts\\python.exe -m pip install simple-lama-inpainting",
  );
}

function normalizePolicy(value) {
  const normalized = String(value ?? "force_all_regions").trim().toLowerCase();
  if (["off", "safe_bubbles_only", "ask_on_unsafe", "force_all_regions"].includes(normalized)) {
    return normalized;
  }
  return "force_all_regions";
}

function normalizeMode(value) {
  const normalized = String(value ?? "manual_selection").trim().toLowerCase();
  if (["auto_after_ocr", "manual_selection", "retry"].includes(normalized)) return normalized;
  return "manual_selection";
}

function normalizeSource(value) {
  const normalized = String(value ?? "manual_clean").trim().toLowerCase();
  if (["ocr_page", "ocr_region", "ocr_chapter", "manual_clean"].includes(normalized)) return normalized;
  return "manual_clean";
}

function cleanAttemptId() {
  return `clean_attempt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeString(value, fallback = null) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function isSafeBubbleClassification(classification, policy) {
  if (policy === "force_all_regions") return true;
  if (policy === "off") return false;
  const safeKinds = new Set(["white_bubble", "black_bubble", "flat_light_box", "flat_dark_box"]);
  return safeKinds.has(classification?.kind) && Number(classification?.confidence ?? 0) >= 0.72;
}

function isBubbleLikeClassification(classification) {
  const bubbleKinds = new Set(["white_bubble", "black_bubble", "flat_light_box", "flat_dark_box"]);
  return bubbleKinds.has(classification?.kind);
}

function resolveEffectiveProvider(provider, classification) {
  if (provider !== "algorithm") return provider;
  return isBubbleLikeClassification(classification) ? "free_text_inpaint" : "lama";
}

function shouldSkipClean(provider, classification, policy) {
  if (policy === "off") return true;
  if (provider === "algorithm") return false;
  return !isSafeBubbleClassification(classification, policy);
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

function normalizeFreeRegion(region, fallback = null) {
  const raw = region && typeof region === "object" ? region : fallback;
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    type: "box",
    x: roundCoordinate(x),
    y: roundCoordinate(y),
    width: roundCoordinate(width),
    height: roundCoordinate(height),
  };
}

function intersectRegions(first, second) {
  if (!first || !second) return null;
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return {
    type: "box",
    x: roundCoordinate(left),
    y: roundCoordinate(top),
    width: roundCoordinate(right - left),
    height: roundCoordinate(bottom - top),
  };
}

function versionedPatchUrl(patchUrl, timestamp) {
  const url = new URL(patchUrl);
  url.searchParams.set("v", String(new Date(timestamp).getTime()));
  return url.toString();
}

function appendRestoreMetadata(metadata, restoreEntry) {
  const current = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const existing = Array.isArray(current.restoreAreas) ? current.restoreAreas : [];
  return {
    ...current,
    restoreAreas: [...existing.slice(-24), restoreEntry],
  };
}

function mapCleanPatchRow(row) {
  const metadata = safeJson(row.metadata_json, undefined);
  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageId: row.page_id,
    kind: "clean_patch",
    classification: row.classification ?? metadata?.classification?.kind ?? undefined,
    cleanMode: row.mode ?? undefined,
    cleanProvider: row.provider ?? undefined,
    cleanSource: row.source ?? undefined,
    confidence: row.confidence == null ? undefined : Number(row.confidence),
    method: row.method,
    maskExpansion: Number(row.mask_expansion ?? 4),
    metadata,
    feather: Number(row.feather ?? 2),
    opacity: Number(row.opacity ?? 1),
    patchUrl: row.patch_path,
    region: JSON.parse(row.region_json),
    sourceOcrRunId: row.source_ocr_run_id ?? undefined,
    sourceTextUnitId: row.source_text_unit_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function removeIfExists(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
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

  existingCleanPatches(pageId) {
    const rows = this.db.prepare(`
      SELECT region_json, patch_path
      FROM page_clean_patches
      WHERE page_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(pageId);

    return rows
      .map((row) => {
        try {
          const patchPath = localPathFromPageAsset(this.workspacePath, row.patch_path);
          if (!fs.existsSync(patchPath)) return null;
          return {
            path: patchPath,
            region: JSON.parse(row.region_json),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  getCleanPatchRow(markId) {
    const row = this.db.prepare(`
      SELECT
        cp.*,
        c.project_id
      FROM page_clean_patches cp
      JOIN chapters c ON c.id = cp.chapter_id
      WHERE cp.id = ?
    `).get(String(markId ?? ""));

    if (!row) throw new Error("Clean patch was not found");
    if (!this.workspacePath) throw new Error("Smart clean workspace path is not configured");
    return row;
  }

  insertCleanAttempt({
    page,
    region,
    mode,
    provider,
    policy,
    sourceTextUnitId,
    sourceOcrRunId,
    classification,
    status,
    patchId = null,
    errorMessage = null,
    timestamp,
  }) {
    const metrics = classification?.metrics ?? {};
    this.db.prepare(`
      INSERT INTO clean_attempts (
        id, chapter_id, page_id, text_unit_id, ocr_run_id, mode, provider,
        policy, region_json, classification, confidence, status, patch_id,
        error_message, metrics_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanAttemptId(),
      page.chapterId,
      page.pageId,
      sourceTextUnitId ?? null,
      sourceOcrRunId ?? null,
      mode,
      provider,
      policy,
      JSON.stringify(region),
      classification?.kind ?? null,
      classification?.confidence ?? null,
      status,
      patchId,
      errorMessage,
      JSON.stringify(metrics),
      timestamp,
      timestamp,
    );
  }

  async classifyRegion(pageId, input) {
    const page = this.getPage(pageId);
    const region = normalizeRegion(input?.region, page);
    const outputPath = assertInsideWorkspace(
      this.workspacePath,
      path.join(this.workspacePath, ".tmp", `clean_classify_${Date.now()}_${Math.random().toString(16).slice(2)}.png`),
    );
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    const existingPatches = this.existingCleanPatches(page.pageId);
    const manifestPath = existingPatches.length > 0 ? `${outputPath}.patches.json` : "";
    if (manifestPath) {
      await fsp.writeFile(manifestPath, JSON.stringify(existingPatches), "utf8");
    }

    let result;
    try {
      result = await execFileAsync(
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
          String(input?.maskExpansion ?? 2),
          "0",
          "telea",
          manifestPath,
          "classify",
        ],
        {
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
    } finally {
      await removeIfExists(outputPath);
      await removeIfExists(manifestPath);
    }
    const metadata = safeJson(String(result.stdout || "{}"), {});
    return metadata.classification ?? {
      kind: "unknown",
      confidence: 0,
      metrics: {},
      reason: "Classifier returned no result.",
    };
  }

  async cleanText(pageId, input) {
    const page = this.getPage(pageId);
    const region = normalizeRegion(input?.region, page);
    const maskRegion = input?.maskRegion ? normalizeRegion(input.maskRegion, page) : null;
    const method = normalizeMethod(input?.method);
    const provider = normalizeProvider(input?.provider, method);
    const policy = normalizePolicy(input?.policy);
    const mode = normalizeMode(input?.mode);
    const source = normalizeSource(input?.source);
    const sourceTextUnitId = safeString(input?.sourceTextUnitId);
    const sourceOcrRunId = safeString(input?.sourceOcrRunId);
    const maskExpansion = Math.round(clamp(Number(input?.maskExpansion ?? 4), 0, 18));
    const feather = Math.round(clamp(Number(input?.feather ?? 2), 0, 16));
    const id = cleanPatchId();
    const timestamp = new Date().toISOString();

    const classificationRegion = maskRegion ?? region;
    const classification = await this.classifyRegion(pageId, { maskExpansion, region: classificationRegion });
    const effectiveProvider = resolveEffectiveProvider(provider, classification);
    if (shouldSkipClean(provider, classification, policy)) {
      this.insertCleanAttempt({
        classification,
        mode,
        page,
        policy,
        provider,
        region,
        sourceOcrRunId,
        sourceTextUnitId,
        status: "skipped",
        timestamp,
      });
      return {
        chapterId: page.chapterId,
        classification: classification.kind,
        confidence: classification.confidence,
        id: cleanAttemptId(),
        kind: "clean_patch",
        metadata: {
          classification,
          skipped: true,
          reason: classification.reason,
        },
        pageId: page.pageId,
        region,
        skipped: true,
        status: "skipped",
      };
    }

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
    const outputDirectory = path.dirname(outputPath);
    await fsp.mkdir(outputDirectory, { recursive: true });

    const existingPatches = this.existingCleanPatches(page.pageId);
    const manifestPath = existingPatches.length > 0 ? `${outputPath}.patches.json` : "";
    if (manifestPath) {
      await fsp.writeFile(manifestPath, JSON.stringify(existingPatches), "utf8");
    }

    let stdout = "";
    try {
      const providerPython = resolveProviderPython(effectiveProvider, this.pythonCommand);
      const result = await execFileAsync(
        providerPython,
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
          manifestPath,
          effectiveProvider,
          policy,
          maskRegion ? String(maskRegion.x) : "",
          maskRegion ? String(maskRegion.y) : "",
          maskRegion ? String(maskRegion.width) : "",
          maskRegion ? String(maskRegion.height) : "",
        ],
        {
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
      stdout = result.stdout;
    } finally {
      await removeIfExists(manifestPath);
    }

    let metadata = {};
    try {
      metadata = JSON.parse(String(stdout || "{}"));
    } catch {
      metadata = {};
    }
    metadata.existingPatchCount = existingPatches.length;
    metadata.classification = metadata.classification ?? classification;
    metadata.requestedProvider = provider;
    metadata.effectiveProvider = effectiveProvider;
    if (maskRegion) metadata.maskRegion = maskRegion;

    await fsp.stat(outputPath);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO page_clean_patches (
          id, chapter_id, page_id, region_json, patch_path, method,
          mask_expansion, feather, opacity, provider, mode, source,
          source_text_unit_id, source_ocr_run_id, classification, confidence,
          status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        provider,
        mode,
        source,
        sourceTextUnitId,
        sourceOcrRunId,
        metadata.classification?.kind ?? classification.kind ?? null,
        metadata.classification?.confidence ?? classification.confidence ?? null,
        "applied",
        JSON.stringify(metadata),
        timestamp,
        timestamp,
      );
      this.insertCleanAttempt({
        classification: metadata.classification ?? classification,
        mode,
        page,
        patchId: id,
        policy,
        provider,
        region,
        sourceOcrRunId,
        sourceTextUnitId,
        status: "applied",
        timestamp,
      });
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
        metadata_json: JSON.stringify(metadata),
        mode,
        provider,
        source,
        classification: metadata.classification?.kind ?? classification.kind ?? null,
        confidence: metadata.classification?.confidence ?? classification.confidence ?? null,
        feather,
        opacity: 1,
        created_at: timestamp,
        updated_at: timestamp,
      }),
      metadata,
    };
  }

  async restorePatchArea(markId, input) {
    const row = this.getCleanPatchRow(markId);
    const storedPatchRegion = normalizeFreeRegion(safeJson(row.region_json, null));
    const displayPatchRegion = normalizeFreeRegion(input?.patchRegion, storedPatchRegion);
    const restoreRegion = normalizeFreeRegion(input?.region);
    const intersection = intersectRegions(restoreRegion, displayPatchRegion);
    if (!storedPatchRegion || !displayPatchRegion || !restoreRegion) {
      throw new Error("Restore area has invalid geometry");
    }
    if (!intersection) {
      throw new Error("Restore area does not overlap this clean patch");
    }

    const feather = Math.round(clamp(Number(input?.feather ?? 0), 0, 12));
    const patchPath = localPathFromPageAsset(this.workspacePath, row.patch_path);
    if (!fs.existsSync(patchPath)) {
      throw new Error("Clean patch image file was not found on disk");
    }

    const originalPatchBytes = await fsp.readFile(patchPath);
    let restoreMetadata = {};
    try {
      const result = await execFileAsync(
        this.pythonCommand,
        [
          RESTORE_CLEAN_PATCH_SCRIPT,
          patchPath,
          String(restoreRegion.x),
          String(restoreRegion.y),
          String(restoreRegion.width),
          String(restoreRegion.height),
          String(displayPatchRegion.x),
          String(displayPatchRegion.y),
          String(displayPatchRegion.width),
          String(displayPatchRegion.height),
          String(feather),
        ],
        {
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
      restoreMetadata = safeJson(String(result.stdout || "{}"), {});
    } catch (error) {
      await fsp.writeFile(patchPath, originalPatchBytes);
      throw error;
    }

    const timestamp = new Date().toISOString();
    const shouldDeletePatch = Number(restoreMetadata.remainingAlphaPixels ?? 1) <= 0;
    const restoreEntry = {
      at: timestamp,
      displayPatchRegion,
      feather,
      intersection,
      patchRegion: storedPatchRegion,
      pixelRegion: restoreMetadata.pixelRegion ?? null,
      region: restoreRegion,
      changedPixels: Number(restoreMetadata.changedPixels ?? 0),
    };

    this.db.exec("BEGIN");
    try {
      if (shouldDeletePatch) {
        this.db.prepare("DELETE FROM page_clean_patches WHERE id = ?").run(row.id);
      } else {
        const metadata = appendRestoreMetadata(safeJson(row.metadata_json, {}), restoreEntry);
        metadata.lastRestoreArea = restoreEntry;
        const patchUrl = versionedPatchUrl(row.patch_path, timestamp);
        this.db.prepare(`
          UPDATE page_clean_patches
          SET patch_path = ?, metadata_json = ?, updated_at = ?
          WHERE id = ?
        `).run(patchUrl, JSON.stringify(metadata), timestamp, row.id);
        row.patch_path = patchUrl;
        row.metadata_json = JSON.stringify(metadata);
        row.updated_at = timestamp;
      }

      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, row.chapter_id);
      this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, row.project_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      await fsp.writeFile(patchPath, originalPatchBytes);
      throw error;
    }

    if (shouldDeletePatch) {
      await removeIfExists(patchPath);
      return {
        chapterId: row.chapter_id,
        deleted: true,
        markId: row.id,
        pageId: row.page_id,
        restoredRegion: intersection,
        changedPixels: Number(restoreMetadata.changedPixels ?? 0),
      };
    }

    return {
      chapterId: row.chapter_id,
      deleted: false,
      markId: row.id,
      pageId: row.page_id,
      patch: mapCleanPatchRow(row),
      restoredRegion: intersection,
      changedPixels: Number(restoreMetadata.changedPixels ?? 0),
    };
  }
}

module.exports = {
  PageCleanService,
};
