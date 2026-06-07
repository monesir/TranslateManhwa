const { mapChapterRow } = require("./mappers.cjs");

class ChapterRepository {
  constructor(db) {
    this.db = db;
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
