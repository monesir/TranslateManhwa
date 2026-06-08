const { mapProjectRow, parseJson } = require("./mappers.cjs");

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

function normalizeGenres(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 40);
}

class ProjectRepository {
  constructor(db) {
    this.db = db;
  }

  uniqueManualProjectIdentity(title) {
    const baseSlug = slugify(title);

    for (let index = 0; index < 10_000; index += 1) {
      const suffix = index === 0 ? "" : `-${index + 1}`;
      const slug = `${baseSlug}${suffix}`;
      const id = `project_${slug}`.slice(0, 140);
      const existing = this.db.prepare(`
        SELECT id FROM projects
        WHERE id = ? OR slug = ?
        LIMIT 1
      `).get(id, slug);

      if (!existing) return { id, slug };
    }

    throw new Error("Could not allocate a unique project id");
  }

  createProject(input) {
    const title = cleanString(input?.title);
    if (!title) {
      throw new Error("Project title is required");
    }

    const originalTitle = cleanString(input?.originalTitle) ?? title;
    const arabicTitle = cleanString(input?.arabicTitle);
    const sourceLanguage = cleanString(input?.sourceLanguage) ?? "English";
    const targetLanguage = cleanString(input?.targetLanguage) ?? "Arabic";
    const description = cleanString(input?.description);
    const contextSummary = cleanString(input?.contextSummary) ?? description ?? "";
    const genres = normalizeGenres(input?.genres);
    const timestamp = new Date().toISOString();
    const { id, slug } = this.uniqueManualProjectIdentity(title);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO projects (
          id, slug, title, arabic_title, original_title, source_language,
          target_language, cover_asset_id, status, last_worked_chapter_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'Active', NULL, ?, ?)
      `).run(
        id,
        slug,
        title,
        arabicTitle,
        originalTitle,
        sourceLanguage,
        targetLanguage,
        timestamp,
        timestamp,
      );

      this.db.prepare(`
        INSERT INTO project_metadata (
          project_id, author, artist, description, genres_json, external_status, start_year
        ) VALUES (?, NULL, NULL, ?, ?, NULL, NULL)
      `).run(id, description, JSON.stringify(genres));

      this.db.prepare(`
        INSERT INTO project_contexts (project_id, markdown, summary, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(
        id,
        contextSummary ? `# Work Context\n\n${contextSummary}` : "# Work Context",
        contextSummary,
        timestamp,
      );

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const row = this.db.prepare(`
      SELECT
        p.*,
        NULL AS last_worked_chapter_label,
        NULL AS cover_asset_path,
        NULL AS cover_metadata_json,
        0 AS progress
      FROM projects p
      WHERE p.id = ?
    `).get(id);

    return mapProjectRow(row);
  }

  listLibraryProjects() {
    const rows = this.db.prepare(`
      SELECT
        p.*,
        lc.display_label AS last_worked_chapter_label,
        cover.path AS cover_asset_path,
        cover.metadata_json AS cover_metadata_json,
        CASE
          WHEN COUNT(c.id) = 0 THEN 0
          ELSE ROUND(
            (
              SUM(CASE WHEN c.status = 'Completed' THEN 1 ELSE 0 END) * 100.0 +
              SUM(CASE WHEN c.status = 'In Progress' THEN 45 ELSE 0 END)
            ) / COUNT(c.id)
          )
        END AS progress
      FROM projects p
      LEFT JOIN chapters lc ON lc.id = p.last_worked_chapter_id
      LEFT JOIN assets cover ON cover.id = p.cover_asset_id
      LEFT JOIN chapters c ON c.project_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();

    return rows.map(mapProjectRow);
  }

  getLibraryStats() {
    const last = this.db.prepare(`
      SELECT p.title, c.display_label, p.updated_at
      FROM projects p
      LEFT JOIN chapters c ON c.id = p.last_worked_chapter_id
      ORDER BY p.updated_at DESC
      LIMIT 1
    `).get();

    const activeProjects = this.db.prepare(`
      SELECT COUNT(*) AS count FROM projects WHERE status = 'Active'
    `).get().count;

    const chaptersInProgress = this.db.prepare(`
      SELECT COUNT(*) AS count FROM chapters WHERE status = 'In Progress'
    `).get().count;

    const completedChapters = this.db.prepare(`
      SELECT COUNT(*) AS count FROM chapters WHERE status = 'Completed'
    `).get().count;

    return {
      lastWorkedChapter: last ? `${last.title} - ${last.display_label}` : "None",
      lastModifiedAt: last?.updated_at ?? new Date().toISOString(),
      activeProjects: Number(activeProjects),
      chaptersInProgress: Number(chaptersInProgress),
      completedChapters: Number(completedChapters),
    };
  }

  getProjectOverview(projectId) {
    const row = this.db.prepare(`
      SELECT
        p.*,
        cover.path AS cover_asset_path,
        cover.metadata_json AS cover_metadata_json,
        lc.display_label AS last_worked_chapter_label,
        pm.genres_json,
        pc.summary AS context_summary,
        CASE
          WHEN COUNT(c.id) = 0 THEN 0
          ELSE ROUND(
            (
              SUM(CASE WHEN c.status = 'Completed' THEN 1 ELSE 0 END) * 100.0 +
              SUM(CASE WHEN c.status = 'In Progress' THEN 45 ELSE 0 END)
            ) / COUNT(c.id)
          )
        END AS progress
      FROM projects p
      LEFT JOIN assets cover ON cover.id = p.cover_asset_id
      LEFT JOIN chapters lc ON lc.id = p.last_worked_chapter_id
      LEFT JOIN project_metadata pm ON pm.project_id = p.id
      LEFT JOIN project_contexts pc ON pc.project_id = p.id
      LEFT JOIN chapters c ON c.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(projectId);

    if (!row) return undefined;

    const project = mapProjectRow(row);
    const chaptersCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM chapters WHERE project_id = ?
    `).get(projectId).count;
    const charactersCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM characters WHERE project_id = ?
    `).get(projectId).count;
    const generalTermsCount = this.db.prepare(`
      SELECT COUNT(*) AS count FROM glossary_terms WHERE project_id = ?
    `).get(projectId).count;

    return {
      ...project,
      chaptersCount: Number(chaptersCount),
      charactersCount: Number(charactersCount),
      generalTermsCount: Number(generalTermsCount),
      contextSummary: row.context_summary ?? "",
      genres: parseJson(row.genres_json, []),
    };
  }
}

module.exports = {
  ProjectRepository,
};
