const { execFile } = require("node:child_process");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { PAGE_CACHE_HOST } = require("../data/chapter-page-store.cjs");
const { COVER_CACHE_SCHEME, sanitizeFilePart } = require("../data/cover-cache.cjs");

const execFileAsync = promisify(execFile);
const MERGE_PAGES_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "merge-pages.py");
const MERGED_PAGE_INDEX_OFFSET = 100000;

function assertInsideWorkspace(workspacePath, candidatePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(candidatePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Merged page path escaped the workspace directory");
  }
  return resolved;
}

function localPathFromPageAsset(workspacePath, assetPath) {
  if (!assetPath || !assetPath.startsWith(`${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/`)) {
    throw new Error("Page merge requires local cached page images");
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

function mergeGroupId(chapterId) {
  return `merge_${sanitizeFilePart(chapterId)}_${Date.now()}`;
}

function normalizeDirection(value) {
  return String(value ?? "vertical").toLowerCase() === "horizontal" ? "horizontal" : "vertical";
}

class PageMergeService {
  constructor(db, options = {}) {
    this.db = db;
    this.workspacePath = options.workspacePath;
    this.pythonCommand = options.pythonCommand || process.env.FLORIS_PYTHON || "python";
  }

  listOriginalPages(chapterId) {
    if (!this.workspacePath) throw new Error("Page merge workspace path is not configured");
    return this.db.prepare(`
      SELECT
        p.id AS page_id,
        p.chapter_id,
        p.page_index,
        COALESCE(p.width, a.width, 820) AS width,
        COALESCE(p.height, a.height, 1240) AS height,
        a.id AS asset_id,
        a.path AS asset_path,
        c.project_id
      FROM pages p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN assets a ON a.id = p.asset_id
      WHERE p.chapter_id = ?
        AND COALESCE(p.page_kind, 'original') = 'original'
      ORDER BY p.page_index ASC
    `).all(chapterId).map((row) => ({
      ...row,
      localPath: localPathFromPageAsset(this.workspacePath, row.asset_path),
    }));
  }

  existingMergedAssets(chapterId) {
    return this.db.prepare(`
      SELECT p.id AS page_id, a.id AS asset_id, a.path AS asset_path
      FROM pages p
      JOIN assets a ON a.id = p.asset_id
      WHERE p.chapter_id = ? AND p.page_kind = 'merged'
      ORDER BY p.page_index ASC
    `).all(chapterId);
  }

  async removeMergedPages(chapterId) {
    const rows = this.existingMergedAssets(chapterId);
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM pages WHERE chapter_id = ? AND page_kind = 'merged'").run(chapterId);
      for (const row of rows) {
        this.db.prepare("DELETE FROM assets WHERE id = ?").run(row.asset_id);
      }
      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, chapterId);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, chapterId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    let assetsDeleted = 0;
    for (const row of rows) {
      try {
        await fsp.unlink(localPathFromPageAsset(this.workspacePath, row.asset_path));
        assetsDeleted += 1;
      } catch {
        // Database state is authoritative; missing files are ignored.
      }
    }
    return { assetsDeleted, chapterId, mergedPagesDeleted: rows.length };
  }

  async mergeEveryTwoPages(chapterId, input = {}) {
    const direction = normalizeDirection(input.direction);
    if (input.replaceExisting !== false) {
      await this.removeMergedPages(chapterId);
    }

    const pages = this.listOriginalPages(chapterId);
    if (pages.length === 0) throw new Error("Chapter has no original local pages to merge");

    const groupId = mergeGroupId(chapterId);
    const timestamp = new Date().toISOString();
    const createdPages = [];
    let sourcePagesUsed = 0;

    for (let index = 0; index < pages.length; index += 2) {
      const pair = pages.slice(index, index + 2);
      const mergedNumber = Math.floor(index / 2) + 1;
      const assetId = `asset_${groupId}_${String(mergedNumber).padStart(4, "0")}`;
      const pageId = `page_${groupId}_${String(mergedNumber).padStart(4, "0")}`;
      const relativePath = path
        .join(
          "projects",
          sanitizeFilePart(pair[0].project_id),
          "chapters",
          sanitizeFilePart(chapterId),
          "merged",
          `${String(mergedNumber).padStart(4, "0")}.png`,
        )
        .replace(/\\/g, "/");
      const outputPath = assertInsideWorkspace(this.workspacePath, path.join(this.workspacePath, relativePath));
      const manifestPath = assertInsideWorkspace(this.workspacePath, `${outputPath}.manifest.json`);
      await fsp.mkdir(path.dirname(outputPath), { recursive: true });
      await fsp.writeFile(
        manifestPath,
        JSON.stringify({
          direction,
          outputPath,
          sources: pair.map((page) => ({
            pageId: page.page_id,
            pageIndex: Number(page.page_index),
            path: page.localPath,
          })),
        }),
        "utf8",
      );

      let metadata;
      try {
        const result = await execFileAsync(this.pythonCommand, [MERGE_PAGES_SCRIPT, manifestPath], {
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        metadata = JSON.parse(String(result.stdout || "{}"));
      } finally {
        await fsp.unlink(manifestPath).catch(() => {});
      }

      const stats = await fsp.stat(outputPath);
      this.db.exec("BEGIN");
      try {
        this.db.prepare(`
          INSERT INTO assets (
            id, project_id, kind, path, mime_type, width, height, size_bytes,
            checksum, metadata_json, created_at
          ) VALUES (?, ?, 'page', ?, 'image/png', ?, ?, ?, NULL, ?, ?)
        `).run(
          assetId,
          pair[0].project_id,
          pageCacheUrl(relativePath),
          Number(metadata.width),
          Number(metadata.height),
          stats.size,
          JSON.stringify({ direction, merged: true, sourcePageIds: pair.map((page) => page.page_id) }),
          timestamp,
        );
        this.db.prepare(`
          INSERT INTO pages (
            id, chapter_id, asset_id, page_index, width, height,
            page_kind, merged_group_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'merged', ?, ?, ?)
        `).run(
          pageId,
          chapterId,
          assetId,
          MERGED_PAGE_INDEX_OFFSET + mergedNumber,
          Number(metadata.width),
          Number(metadata.height),
          groupId,
          timestamp,
          timestamp,
        );
        for (const placement of metadata.placements ?? []) {
          this.db.prepare(`
            INSERT INTO page_merge_sources (
              id, merged_page_id, source_page_id, source_page_index,
              x, y, width, height, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `merge_source_${pageId}_${placement.sourcePageId}`,
            pageId,
            placement.sourcePageId,
            Number(placement.sourcePageIndex),
            Number(placement.x),
            Number(placement.y),
            Number(placement.width),
            Number(placement.height),
            timestamp,
          );
        }
        this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, chapterId);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      sourcePagesUsed += pair.length;
      createdPages.push(pageId);
    }

    return {
      chapterId,
      direction,
      mergedPagesCreated: createdPages.length,
      sourcePagesUsed,
    };
  }
}

module.exports = {
  PageMergeService,
};
