const {
  mapPageRow,
  mapProjectRow,
  mapTextUnitRow,
} = require("./mappers.cjs");
const { ChapterRepository } = require("./chapter-repository.cjs");
const { DictionaryRepository } = require("./dictionary-repository.cjs");

const DEFAULT_TEXT_UNIT_FONT_SIZE = 18;
const MIN_TEXT_UNIT_FONT_SIZE = 8;
const MAX_TEXT_UNIT_FONT_SIZE = 72;

function normalizeFontSize(value) {
  if (value == null || value === "") return DEFAULT_TEXT_UNIT_FONT_SIZE;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TEXT_UNIT_FONT_SIZE;
  return Math.max(MIN_TEXT_UNIT_FONT_SIZE, Math.min(MAX_TEXT_UNIT_FONT_SIZE, Math.round(numeric)));
}

function normalizeFontDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-24, Math.min(24, Math.round(numeric)));
}

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
        ) AS ocr_provider,
        (
          SELECT ti.font_size
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS typesetting_font_size
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

    return mapTextUnitRow(updated);
  }

  deleteTextUnit(textUnitId) {
    const existing = this.db.prepare(`
      SELECT id, chapter_id
      FROM text_units
      WHERE id = ?
    `).get(textUnitId);

    if (!existing) {
      throw new Error("Text unit not found");
    }

    const timestamp = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE ocr_candidates SET text_unit_id = NULL WHERE text_unit_id = ?").run(textUnitId);
      this.db.prepare("DELETE FROM text_units WHERE id = ?").run(textUnitId);

      const remaining = this.db.prepare(`
        SELECT id
        FROM text_units
        WHERE chapter_id = ?
        ORDER BY unit_order ASC, created_at ASC, id ASC
      `).all(existing.chapter_id);

      for (const [index, row] of remaining.entries()) {
        this.db.prepare("UPDATE text_units SET unit_order = ?, updated_at = ? WHERE id = ?").run(
          index + 1,
          timestamp,
          row.id,
        );
      }

      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, existing.chapter_id);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, existing.chapter_id);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      chapterId: existing.chapter_id,
      id: textUnitId,
    };
  }

  upsertTextUnitFontSize(textUnitId, fontSize, timestamp) {
    const normalizedFontSize = normalizeFontSize(fontSize);
    this.db.prepare(`
      INSERT INTO typesetting_items (
        id, text_unit_id, font_family, font_size, font_weight, align, box_json, style_json, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        font_size = excluded.font_size,
        style_json = excluded.style_json,
        updated_at = excluded.updated_at
    `).run(
      `typesetting_${textUnitId}`,
      textUnitId,
      normalizedFontSize,
      JSON.stringify({ fontSize: normalizedFontSize }),
      timestamp,
      timestamp,
    );
    return normalizedFontSize;
  }

  updateTextUnitTypesetting(textUnitId, input) {
    const existing = this.db.prepare(`
      SELECT tu.id, tu.chapter_id
      FROM text_units tu
      WHERE tu.id = ?
    `).get(textUnitId);

    if (!existing) {
      throw new Error("Text unit not found");
    }

    const timestamp = new Date().toISOString();
    const fontSize = normalizeFontSize(input?.fontSize);

    this.db.exec("BEGIN");
    try {
      this.upsertTextUnitFontSize(textUnitId, fontSize, timestamp);
      this.db.prepare("UPDATE text_units SET updated_at = ? WHERE id = ?").run(timestamp, textUnitId);
      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, existing.chapter_id);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, existing.chapter_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      chapterId: existing.chapter_id,
      fontSize,
      id: textUnitId,
    };
  }

  updateChapterTextSize(chapterId, input) {
    const chapter = this.db.prepare(`
      SELECT id
      FROM chapters
      WHERE id = ?
    `).get(chapterId);

    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const delta = normalizeFontDelta(input?.delta);
    const timestamp = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT
        tu.id,
        (
          SELECT ti.font_size
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS font_size
      FROM text_units tu
      WHERE tu.chapter_id = ?
      ORDER BY tu.unit_order ASC
    `).all(chapterId);

    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        const currentFontSize = normalizeFontSize(row.font_size);
        this.upsertTextUnitFontSize(row.id, currentFontSize + delta, timestamp);
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

    return {
      chapterId,
      delta,
      updated: rows.length,
    };
  }
}

module.exports = {
  TranslationWorkspaceRepository,
};
