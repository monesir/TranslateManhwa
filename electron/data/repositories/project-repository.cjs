const { mapProjectRow, parseJson } = require("./mappers.cjs");

class ProjectRepository {
  constructor(db) {
    this.db = db;
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
