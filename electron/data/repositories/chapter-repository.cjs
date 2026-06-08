const { mapChapterRow } = require("./mappers.cjs");
const path = require("node:path");

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "untitled";
}

function cleanString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function chapterNumberValue(value) {
  const normalized = cleanString(value);
  return normalized ?? "1";
}

function chapterDisplayLabel(number, title) {
  const normalizedNumber = cleanString(number);
  if (normalizedNumber) return `Chapter ${normalizedNumber}`;
  return cleanString(title) ?? "Chapter";
}

class ChapterRepository {
  constructor(db, options = {}) {
    this.db = db;
    this.chapterPageStore = options.chapterPageStore;
  }

  uniqueChapterId(projectId, number, title) {
    const prefix = `${projectId}_chapter_`;
    const maxSlugLength = Math.max(24, 180 - prefix.length);
    const base = slugify(`${number ?? ""}-${title ?? ""}`).slice(0, maxSlugLength);

    for (let index = 0; index < 10_000; index += 1) {
      const suffix = index === 0 ? "" : `-${index + 1}`;
      const suffixSpace = Math.max(0, maxSlugLength - suffix.length);
      const chapterId = `${prefix}${base.slice(0, suffixSpace)}${suffix}`;
      const existing = this.db.prepare(`
        SELECT id FROM chapters
        WHERE id = ?
        LIMIT 1
      `).get(chapterId);

      if (!existing) return chapterId;
    }

    throw new Error("Could not allocate a unique chapter id");
  }

  nextSortOrder(projectId, number) {
    const numeric = Number(number);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric * 1000);
    }

    const row = this.db.prepare(`
      SELECT COALESCE(MAX(sort_order), 0) AS sort_order
      FROM chapters
      WHERE project_id = ?
    `).get(projectId);

    return Number(row?.sort_order ?? 0) + 1000;
  }

  async createProjectChapter(projectId, input) {
    if (!this.chapterPageStore) {
      throw new Error("Chapter page storage is not configured");
    }

    const project = this.db.prepare(`
      SELECT id FROM projects
      WHERE id = ?
      LIMIT 1
    `).get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const number = chapterNumberValue(input?.number);
    const title = cleanString(input?.title);
    const imagePaths = Array.isArray(input?.imagePaths)
      ? input.imagePaths.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    if (imagePaths.length === 0) {
      throw new Error("At least one chapter page image is required");
    }

    const chapterId = this.uniqueChapterId(projectId, number, title);
    const timestamp = new Date().toISOString();
    const importedPages = [];

    for (const [index, imagePath] of imagePaths.entries()) {
      const pageIndex = index + 1;
      const padded = String(pageIndex).padStart(4, "0");
      const assetId = `asset_${chapterId}_page_${padded}`;
      const pageId = `page_${chapterId}_${padded}`;
      const stored = await this.chapterPageStore.importPageFile({
        assetId,
        chapterId,
        pageIndex,
        projectId,
        sourcePath: imagePath,
      });

      importedPages.push({
        assetId,
        metadata: {
          tone: index % 2 === 0 ? "night" : "gate",
          sourceImagePath: imagePath,
          import: {
            status: "imported",
            updatedAt: timestamp,
            relativePath: stored.relativePath,
            sizeBytes: stored.sizeBytes,
            mimeType: stored.mimeType,
            originalFileName: path.basename(imagePath),
          },
        },
        pageId,
        pageIndex,
        stored,
      });
    }

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO chapters (
          id, project_id, number, title, display_label, status, internal_status,
          download_status, download_error, downloaded_at, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'In Progress', 'Images Ready', 'Downloaded', NULL, ?, ?, ?, ?)
      `).run(
        chapterId,
        projectId,
        number,
        title,
        chapterDisplayLabel(number, title),
        timestamp,
        this.nextSortOrder(projectId, number),
        timestamp,
        timestamp,
      );

      for (const page of importedPages) {
        this.db.prepare(`
          INSERT INTO assets (
            id, project_id, kind, path, mime_type, width, height, size_bytes,
            checksum, metadata_json, created_at
          ) VALUES (?, ?, 'page', ?, ?, ?, ?, ?, NULL, ?, ?)
        `).run(
          page.assetId,
          projectId,
          page.stored.cacheUrl,
          page.stored.mimeType,
          page.stored.width,
          page.stored.height,
          page.stored.sizeBytes,
          JSON.stringify(page.metadata),
          timestamp,
        );

        this.db.prepare(`
          INSERT INTO pages (
            id, chapter_id, asset_id, page_index, width, height, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          page.pageId,
          chapterId,
          page.assetId,
          page.pageIndex,
          page.stored.width,
          page.stored.height,
          timestamp,
          timestamp,
        );
      }

      this.db.prepare(`
        UPDATE projects
        SET last_worked_chapter_id = ?,
            updated_at = ?
        WHERE id = ?
      `).run(chapterId, timestamp, projectId);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const chapter = this.getChapter(chapterId);
    return {
      projectId,
      chapterId,
      pagesCount: importedPages.length,
      chapter,
    };
  }

  listProjectChapters(projectId) {
    const rows = this.db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) AS pages_count,
        COUNT(DISTINCT tu.id) AS text_units_count,
        CASE
          WHEN c.status = 'Completed' THEN 100
          WHEN COUNT(tu.id) = 0 THEN 0
          ELSE ROUND(
            SUM(CASE WHEN tu.final_translation IS NOT NULL AND tu.final_translation != '' THEN 1 ELSE 0 END)
            * 100.0 / COUNT(tu.id)
          )
        END AS progress
      FROM chapters c
      LEFT JOIN pages p ON p.chapter_id = c.id
      LEFT JOIN text_units tu ON tu.chapter_id = c.id
      WHERE c.project_id = ?
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `).all(projectId);

    return rows.map(mapChapterRow);
  }

  getChapter(chapterId) {
    const row = this.db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) AS pages_count,
        COUNT(DISTINCT tu.id) AS text_units_count,
        CASE
          WHEN c.status = 'Completed' THEN 100
          WHEN COUNT(tu.id) = 0 THEN 0
          ELSE ROUND(
            SUM(CASE WHEN tu.final_translation IS NOT NULL AND tu.final_translation != '' THEN 1 ELSE 0 END)
            * 100.0 / COUNT(tu.id)
          )
        END AS progress
      FROM chapters c
      LEFT JOIN pages p ON p.chapter_id = c.id
      LEFT JOIN text_units tu ON tu.chapter_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(chapterId);

    return mapChapterRow(row);
  }
}

module.exports = {
  ChapterRepository,
};
