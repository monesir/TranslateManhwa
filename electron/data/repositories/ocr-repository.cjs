const path = require("node:path");
const { COVER_CACHE_SCHEME } = require("../cover-cache.cjs");
const { mapTextUnitRow } = require("./mappers.cjs");

const PAGE_CACHE_HOST = "pages";

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function assertInsideWorkspace(workspacePath, candidatePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(candidatePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("OCR image path escaped the workspace directory");
  }
  return resolved;
}

function localPathFromCacheUrl(workspacePath, assetPath) {
  if (!assetPath || !assetPath.startsWith(`${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/`)) {
    throw new Error("OCR requires a local cached page image");
  }

  const url = new URL(assetPath);
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  return assertInsideWorkspace(workspacePath, path.join(workspacePath, relativePath));
}

function runId() {
  return `ocr_run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function candidateId(run, index) {
  return `ocr_candidate_${run}_${String(index + 1).padStart(4, "0")}`;
}

function textUnitId(pageId, run, index) {
  return `textunit_${pageId}_${run}_${String(index + 1).padStart(4, "0")}`;
}

function normalizeRegion(region, page) {
  const x = Math.max(0, Number(region?.x ?? 0));
  const y = Math.max(0, Number(region?.y ?? 0));
  const width = Math.max(1, Number(region?.width ?? page.width));
  const height = Math.max(1, Number(region?.height ?? page.height));
  return {
    type: "box",
    x: Math.min(x, page.width - 1),
    y: Math.min(y, page.height - 1),
    width: Math.min(width, Math.max(1, page.width - x)),
    height: Math.min(height, Math.max(1, page.height - y)),
  };
}

function averageConfidence(items) {
  const values = items
    .map((item) => item.confidence)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function regionRight(region) {
  return Number(region?.x ?? 0) + Number(region?.width ?? 0);
}

function regionBottom(region) {
  return Number(region?.y ?? 0) + Number(region?.height ?? 0);
}

function regionsIntersect(first, second) {
  return !(
    regionRight(first) < Number(second?.x ?? 0) ||
    regionRight(second) < Number(first?.x ?? 0) ||
    regionBottom(first) < Number(second?.y ?? 0) ||
    regionBottom(second) < Number(first?.y ?? 0)
  );
}

class OcrRepository {
  constructor(db, options = {}) {
    this.db = db;
    this.workspacePath = options.workspacePath;
  }

  getPageForOcr(pageId) {
    const row = this.db.prepare(`
      SELECT
        p.id AS page_id,
        p.chapter_id,
        p.page_index,
        COALESCE(p.width, a.width, 820) AS width,
        COALESCE(p.height, a.height, 1240) AS height,
        a.path AS asset_path,
        c.project_id
      FROM pages p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN assets a ON a.id = p.asset_id
      WHERE p.id = ?
    `).get(pageId);
    if (!row) throw new Error(`Page not found: ${pageId}`);
    if (!this.workspacePath) throw new Error("OCR workspace path is not configured");

    return {
      assetPath: row.asset_path,
      chapterId: row.chapter_id,
      imagePath: localPathFromCacheUrl(this.workspacePath, row.asset_path),
      pageId: row.page_id,
      pageIndex: Number(row.page_index),
      projectId: row.project_id,
      width: Number(row.width ?? 820),
      height: Number(row.height ?? 1240),
    };
  }

  listChapterPagesForOcr(chapterId) {
    const rows = this.db.prepare(`
      SELECT p.id
      FROM pages p
      WHERE p.chapter_id = ?
      ORDER BY p.page_index ASC
    `).all(chapterId);
    return rows.map((row) => this.getPageForOcr(row.id));
  }

  createRun({ chapterId, languageHint, mode, provider, settings }) {
    const id = runId();
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ocr_runs (
        id, chapter_id, provider, mode, language_hint, settings_json,
        started_at, completed_at, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'running', NULL)
    `).run(
      id,
      chapterId,
      provider,
      mode,
      languageHint ?? null,
      JSON.stringify(settings ?? {}),
      timestamp,
    );
    return { chapterId, id, startedAt: timestamp };
  }

  failRun(run, error) {
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      UPDATE ocr_runs
      SET completed_at = ?,
          status = 'failed',
          error_message = ?
      WHERE id = ?
    `).run(timestamp, error instanceof Error ? error.message : String(error), run.id);
  }

  completeRun(run, summary) {
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      UPDATE ocr_runs
      SET completed_at = ?,
          status = 'completed',
          settings_json = ?
      WHERE id = ?
    `).run(timestamp, JSON.stringify(summary ?? {}), run.id);
  }

  replacePageTextUnits(pageId) {
    this.db.prepare("DELETE FROM text_units WHERE page_id = ?").run(pageId);
  }

  replacePageTextUnitsInRegion(pageId, region) {
    const rows = this.db.prepare(`
      SELECT id, region_json
      FROM text_units
      WHERE page_id = ?
    `).all(pageId);
    const ids = rows
      .filter((row) => regionsIntersect(parseJson(row.region_json, null), region))
      .map((row) => row.id);

    for (const id of ids) {
      this.db.prepare("DELETE FROM text_units WHERE id = ?").run(id);
    }
  }

  nextOrderOffset(chapterId) {
    const row = this.db.prepare(`
      SELECT COALESCE(MAX(unit_order), 0) AS max_order
      FROM text_units
      WHERE chapter_id = ?
    `).get(chapterId);
    return Number(row?.max_order ?? 0);
  }

  insertItems({ items, page, provider, run, startingOrder }) {
    const timestamp = new Date().toISOString();
    const inserted = [];

    items.forEach((item, index) => {
      const region = normalizeRegion(item.region, page);
      const unitId = textUnitId(page.pageId, run.id, index);
      const itemOrder = startingOrder + index + 1;

      this.db.prepare(`
        INSERT INTO text_units (
          id, chapter_id, page_id, unit_order, region_json,
          source_ocr_text, source_final_text, source_status,
          final_translation, review_status, review_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'Needs Review', NULL, 'Needs Review', NULL, ?, ?)
      `).run(
        unitId,
        page.chapterId,
        page.pageId,
        itemOrder,
        JSON.stringify(region),
        item.text,
        timestamp,
        timestamp,
      );

      this.db.prepare(`
        INSERT INTO ocr_candidates (
          id, ocr_run_id, text_unit_id, page_id, text, confidence, region_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidateId(run.id, startingOrder + index),
        run.id,
        unitId,
        page.pageId,
        item.text,
        item.confidence,
        JSON.stringify({
          ...region,
          provider,
          providerItemId: item.providerItemId ?? null,
          readingOrder: item.readingOrder ?? index + 1,
        }),
        timestamp,
      );

      inserted.push(unitId);
    });

    return inserted;
  }

  applyRecognition({ languageDetected, pageResults, provider, replaceExisting, run }) {
    let candidatesCreated = 0;
    let textUnitsCreated = 0;

    this.db.exec("BEGIN");
    try {
      if (replaceExisting) {
        for (const pageResult of pageResults) {
          if (pageResult.replaceRegion) {
            this.replacePageTextUnitsInRegion(pageResult.page.pageId, pageResult.replaceRegion);
          } else {
            this.replacePageTextUnits(pageResult.page.pageId);
          }
        }
      }

      let orderOffset = this.nextOrderOffset(run.chapterId);
      for (const pageResult of pageResults) {
        const insertedIds = this.insertItems({
          items: pageResult.items,
          page: pageResult.page,
          provider,
          run,
          startingOrder: orderOffset,
        });
        orderOffset += insertedIds.length;
        candidatesCreated += pageResult.items.length;
        textUnitsCreated += insertedIds.length;
      }

      const allItems = pageResults.flatMap((result) => result.items);
      const timestamp = new Date().toISOString();
      this.db.prepare(`
        UPDATE chapters
        SET internal_status = CASE WHEN ? > 0 THEN 'OCR Done' ELSE internal_status END,
            updated_at = ?
        WHERE id = ?
      `).run(textUnitsCreated, timestamp, run.chapterId);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, run.chapterId);

      const summary = {
        averageConfidence: averageConfidence(allItems),
        candidatesCreated,
        languageDetected: languageDetected ?? null,
        pagesProcessed: pageResults.length,
        replaceExisting: Boolean(replaceExisting),
        textUnitsCreated,
      };
      this.completeRun(run, summary);
      this.db.exec("COMMIT");

      return {
        averageConfidence: summary.averageConfidence,
        candidatesCreated,
        chapterId: run.chapterId,
        languageDetected: summary.languageDetected,
        pagesProcessed: summary.pagesProcessed,
        provider,
        runId: run.id,
        status: "completed",
        textUnitsCreated,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.failRun(run, error);
      throw error;
    }
  }

  updateTextUnitSource(textUnitId, input) {
    const sourceText = String(input?.sourceText ?? "").trim();
    const sourceStatus = String(input?.sourceStatus ?? "Needs Review");
    const allowedStatuses = new Set(["Empty", "OCR Ready", "Needs Review", "Reviewed", "Ignored"]);
    if (!allowedStatuses.has(sourceStatus)) {
      throw new Error(`Invalid source status: ${sourceStatus}`);
    }

    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        UPDATE text_units
        SET source_final_text = ?,
            source_status = ?,
            updated_at = ?
        WHERE id = ?
      `).run(sourceText, sourceStatus, timestamp, textUnitId);

      const chapter = this.db.prepare(`
        SELECT chapter_id FROM text_units WHERE id = ?
      `).get(textUnitId);
      if (chapter) {
        this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, chapter.chapter_id);
        this.db.prepare(`
          UPDATE projects
          SET updated_at = ?
          WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
        `).run(timestamp, chapter.chapter_id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const row = this.db.prepare(`
      SELECT
        tu.*,
        (
          SELECT tc.translated_text
          FROM translation_candidates tc
          WHERE tc.text_unit_id = tu.id AND tc.provider = 'ai'
          ORDER BY tc.created_at DESC
          LIMIT 1
        ) AS ai_translation,
        (
          SELECT tc.translated_text
          FROM translation_candidates tc
          WHERE tc.text_unit_id = tu.id AND tc.provider = 'microsoft'
          ORDER BY tc.created_at DESC
          LIMIT 1
        ) AS microsoft_translation,
        (
          SELECT oc.confidence
          FROM ocr_candidates oc
          WHERE oc.text_unit_id = tu.id
          ORDER BY oc.created_at DESC
          LIMIT 1
        ) AS ocr_confidence,
        (
          SELECT ocr.provider
          FROM ocr_candidates oc
          JOIN ocr_runs ocr ON ocr.id = oc.ocr_run_id
          WHERE oc.text_unit_id = tu.id
          ORDER BY oc.created_at DESC
          LIMIT 1
        ) AS ocr_provider
      FROM text_units tu
      WHERE tu.id = ?
    `).get(textUnitId);

    return mapTextUnitRow(row);
  }

  getRunDetails(runId) {
    const row = this.db.prepare("SELECT * FROM ocr_runs WHERE id = ?").get(runId);
    if (!row) return undefined;
    return {
      chapterId: row.chapter_id,
      completedAt: row.completed_at ?? undefined,
      errorMessage: row.error_message ?? undefined,
      id: row.id,
      languageHint: row.language_hint ?? undefined,
      mode: row.mode,
      provider: row.provider,
      settings: parseJson(row.settings_json, {}),
      startedAt: row.started_at,
      status: row.status,
    };
  }
}

module.exports = {
  OcrRepository,
};
