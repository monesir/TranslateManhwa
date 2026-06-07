const { mapChapterRow } = require("./mappers.cjs");

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "untitled";
}

function sourceProjectId(sourceId, titleId) {
  return `source_${slugify(sourceId)}_${slugify(titleId)}`.slice(0, 140);
}

function sourceChapterId(projectId, chapterId) {
  return `${projectId}_chapter_${slugify(chapterId)}`.slice(0, 180);
}

function numberLabel(chapter) {
  if (chapter.chapterNumber == null) return chapter.title || chapter.chapterId;
  return `Chapter ${chapter.chapterNumber}`;
}

function chapterNumberValue(chapter) {
  if (chapter.chapterNumber == null) {
    const match = String(chapter.chapterId ?? chapter.title ?? "").match(/(\d+(?:\.\d+)?)/);
    return match?.[1] ?? String(chapter.chapterId ?? "0");
  }
  return String(chapter.chapterNumber);
}

function sortChapters(chapters) {
  return [...chapters]
    .map((chapter, index) => ({ chapter, index }))
    .sort((a, b) => {
      const left = a.chapter.chapterNumber;
      const right = b.chapter.chapterNumber;
      if (left != null && right != null) return left - right;
      if (left != null) return -1;
      if (right != null) return 1;
      return a.index - b.index;
    });
}

function sourceLanguage(details) {
  const normalized = String(details.originalLanguage ?? "").trim();
  if (normalized) return normalized;
  return "English";
}

class SourceImportRepository {
  constructor(db) {
    this.db = db;
  }

  findProject(sourceId, titleId) {
    const row = this.db.prepare(`
      SELECT p.id
      FROM projects p
      JOIN project_sources ps ON ps.project_id = p.id
      WHERE ps.source_key = ? AND ps.external_id = ?
      LIMIT 1
    `).get(sourceId, titleId);

    return row?.id ?? null;
  }

  ensureProject(sourceId, sourceResult) {
    const timestamp = new Date().toISOString();
    const details = sourceResult.details;
    const existingProjectId = this.findProject(sourceId, details.titleId);
    const projectId = existingProjectId ?? sourceProjectId(sourceId, details.titleId);
    const slug = slugify(`${sourceId}-${details.titleId}`);
    const coverAssetId = details.coverUrl ? `asset_${projectId}_cover` : null;

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO projects (
          id, slug, title, arabic_title, original_title, source_language,
          target_language, cover_asset_id, status, last_worked_chapter_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, 'Arabic', ?, 'Active', NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          original_title = excluded.original_title,
          source_language = excluded.source_language,
          cover_asset_id = excluded.cover_asset_id,
          updated_at = excluded.updated_at
      `).run(
        projectId,
        slug,
        details.name,
        details.name,
        sourceLanguage(details),
        coverAssetId,
        timestamp,
        timestamp,
      );

      if (coverAssetId) {
        this.db.prepare(`
          INSERT INTO assets (
            id, project_id, kind, path, mime_type, width, height, size_bytes,
            checksum, metadata_json, created_at
          ) VALUES (?, ?, 'cover', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            metadata_json = excluded.metadata_json
        `).run(
          coverAssetId,
          projectId,
          details.coverUrl,
          JSON.stringify({ tone: "steel", sourceImageUrl: details.coverUrl }),
          timestamp,
        );
      }

      this.db.prepare(`
        INSERT INTO project_metadata (
          project_id, author, artist, description, genres_json, external_status, start_year
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(project_id) DO UPDATE SET
          author = excluded.author,
          artist = excluded.artist,
          description = excluded.description,
          genres_json = excluded.genres_json,
          external_status = excluded.external_status
      `).run(
        projectId,
        details.authors?.join(", ") || null,
        details.artists?.join(", ") || null,
        details.description ?? details.descriptionSnippet ?? null,
        JSON.stringify(details.tags ?? []),
        details.statusLabel ?? details.status ?? null,
      );

      this.db.prepare(`
        INSERT INTO project_sources (
          id, project_id, source_name, source_key, external_id, url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_name = excluded.source_name,
          url = excluded.url,
          updated_at = excluded.updated_at
      `).run(
        `project_source_${projectId}`,
        projectId,
        details.sourceLabel ?? sourceId,
        sourceId,
        details.titleId,
        details.canonicalUrl,
        timestamp,
        timestamp,
      );

      this.db.prepare(`
        INSERT INTO project_contexts (project_id, markdown, summary, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          markdown = excluded.markdown,
          summary = excluded.summary,
          updated_at = excluded.updated_at
      `).run(
        projectId,
        `# Work Context\n\n${details.description ?? ""}`.trim(),
        details.descriptionSnippet ?? details.description ?? "",
        timestamp,
      );

      this.ensureChapters(projectId, sourceResult.chapters ?? [], timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      projectId,
      created: !existingProjectId,
      chaptersCount: sourceResult.chapters?.length ?? 0,
    };
  }

  ensureChapters(projectId, chapters, timestamp) {
    for (const { chapter, index } of sortChapters(chapters)) {
      const chapterId = sourceChapterId(projectId, chapter.chapterId);
      this.db.prepare(`
        INSERT INTO chapters (
          id, project_id, number, title, display_label, status,
          internal_status, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Not Started', 'Images Ready', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          display_label = excluded.display_label,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `).run(
        chapterId,
        projectId,
        chapterNumberValue(chapter),
        chapter.title || null,
        numberLabel(chapter),
        chapter.chapterNumber == null ? index + 1 : Math.round(chapter.chapterNumber * 1000),
        timestamp,
        timestamp,
      );
    }
  }

  prepareChapter(sourceId, sourceResult, sourceChapter, pages) {
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error("No readable pages were returned for this chapter");
    }

    const project = this.ensureProject(sourceId, sourceResult);
    const timestamp = new Date().toISOString();
    const chapterId = sourceChapterId(project.projectId, sourceChapter.chapterId);

    this.db.exec("BEGIN");
    try {
      this.ensureChapters(project.projectId, [sourceChapter], timestamp);

      pages.forEach((page, index) => {
        const pageIndex = Number(page.pageIndex ?? index) + 1;
        const padded = String(pageIndex).padStart(4, "0");
        const assetId = `asset_${chapterId}_page_${padded}`;
        const pageId = `page_${chapterId}_${padded}`;

        this.db.prepare(`
          INSERT INTO assets (
            id, project_id, kind, path, mime_type, width, height, size_bytes,
            checksum, metadata_json, created_at
          ) VALUES (?, ?, 'page', ?, NULL, 820, 1240, NULL, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            path = excluded.path,
            metadata_json = excluded.metadata_json
        `).run(
          assetId,
          project.projectId,
          page.imageUrl,
          JSON.stringify({ tone: index % 2 === 0 ? "night" : "gate", sourceImageUrl: page.imageUrl }),
          timestamp,
        );

        this.db.prepare(`
          INSERT INTO pages (
            id, chapter_id, asset_id, page_index, width, height, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 820, 1240, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            asset_id = excluded.asset_id,
            page_index = excluded.page_index,
            updated_at = excluded.updated_at
        `).run(pageId, chapterId, assetId, pageIndex, timestamp, timestamp);
      });

      this.db.prepare(`
        UPDATE chapters
        SET status = 'In Progress',
            internal_status = 'Images Ready',
            updated_at = ?
        WHERE id = ?
      `).run(timestamp, chapterId);

      this.db.prepare(`
        UPDATE projects
        SET last_worked_chapter_id = ?, updated_at = ?
        WHERE id = ?
      `).run(chapterId, timestamp, project.projectId);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const chapterRow = this.db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) AS pages_count,
        COUNT(DISTINCT tu.id) AS text_units_count,
        0 AS progress
      FROM chapters c
      LEFT JOIN pages p ON p.chapter_id = c.id
      LEFT JOIN text_units tu ON tu.chapter_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(chapterId);

    return {
      projectId: project.projectId,
      chapterId,
      pagesCount: pages.length,
      chapter: mapChapterRow(chapterRow),
    };
  }
}

module.exports = {
  SourceImportRepository,
  sourceChapterId,
  sourceProjectId,
};
