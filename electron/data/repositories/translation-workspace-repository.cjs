const {
  mapPageRow,
  mapProjectRow,
  mapTextUnitRow,
} = require("./mappers.cjs");
const { ChapterRepository } = require("./chapter-repository.cjs");
const { DictionaryRepository } = require("./dictionary-repository.cjs");

class TranslationWorkspaceRepository {
  constructor(db) {
    this.db = db;
    this.chapterRepository = new ChapterRepository(db);
    this.dictionaryRepository = new DictionaryRepository(db);
  }

  getChapterForTranslation(chapterId) {
    const chapter = this.chapterRepository.getChapter(chapterId);
    if (!chapter) return undefined;

    const projectRow = this.db.prepare(`
      SELECT
        p.*,
        lc.display_label AS last_worked_chapter_label,
        cover.path AS cover_asset_path,
        cover.metadata_json AS cover_metadata_json,
        0 AS progress
      FROM projects p
      LEFT JOIN chapters lc ON lc.id = p.last_worked_chapter_id
      LEFT JOIN assets cover ON cover.id = p.cover_asset_id
      WHERE p.id = ?
    `).get(chapter.projectId);

    const project = mapProjectRow(projectRow);
    const pageState = this.db.prepare(`
      SELECT
        COUNT(p.id) AS total_pages,
        SUM(CASE WHEN a.path LIKE 'floris-cache://pages/%' THEN 1 ELSE 0 END) AS local_pages
      FROM pages p
      JOIN assets a ON a.id = p.asset_id
      WHERE p.chapter_id = ?
    `).get(chapterId);
    const totalPages = Number(pageState?.total_pages ?? 0);
    const localPages = Number(pageState?.local_pages ?? 0);
    const pages = totalPages > 0 && totalPages === localPages
      ? this.db.prepare(`
          SELECT p.*, a.path AS asset_path, a.metadata_json AS asset_metadata_json
          FROM pages p
          JOIN assets a ON a.id = p.asset_id
          WHERE p.chapter_id = ?
          ORDER BY p.page_index ASC
        `).all(chapterId).map(mapPageRow)
      : [];

    const textUnits = this.db.prepare(`
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
        ) AS microsoft_translation
      FROM text_units tu
      WHERE tu.chapter_id = ?
      ORDER BY tu.unit_order ASC
    `).all(chapterId).map(mapTextUnitRow);

    const matches = this.db.prepare(`
      SELECT * FROM dictionary_matches
      WHERE text_unit_id IN (
        SELECT id FROM text_units WHERE chapter_id = ?
      )
    `).all(chapterId);

    const matchesByTextUnit = new Map();
    for (const match of matches) {
      const current = matchesByTextUnit.get(match.text_unit_id) ?? {
        characters: [],
        terms: [],
      };
      if (match.character_id) current.characters.push(match.character_id);
      if (match.glossary_term_id) current.terms.push(match.glossary_term_id);
      matchesByTextUnit.set(match.text_unit_id, current);
    }

    const hydratedTextUnits = textUnits.map((unit) => {
      const matchSet = matchesByTextUnit.get(unit.id);
      return {
        ...unit,
        matchedCharacterIds: matchSet?.characters ?? [],
        matchedGlossaryTermIds: matchSet?.terms ?? [],
      };
    });

    const dictionary = this.dictionaryRepository.getProjectDictionary(chapter.projectId);

    return {
      project,
      chapter,
      pages,
      textUnits: hydratedTextUnits,
      characters: dictionary.characters,
      glossaryTerms: dictionary.glossaryTerms,
    };
  }

  updateFinalTranslation(textUnitId, text) {
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        UPDATE text_units
        SET final_translation = ?,
            review_status = CASE WHEN ? = '' THEN 'Needs Review' ELSE review_status END,
            updated_at = ?
        WHERE id = ?
      `).run(text, text.trim(), timestamp, textUnitId);

      const row = this.db.prepare(`
        SELECT chapter_id FROM text_units WHERE id = ?
      `).get(textUnitId);

      if (row) {
        this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(
          timestamp,
          row.chapter_id,
        );
        this.db.prepare(`
          UPDATE projects
          SET updated_at = ?
          WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
        `).run(timestamp, row.chapter_id);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const updated = this.db.prepare(`
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
        ) AS microsoft_translation
      FROM text_units tu
      WHERE tu.id = ?
    `).get(textUnitId);

    return mapTextUnitRow(updated);
  }
}

module.exports = {
  TranslationWorkspaceRepository,
};
