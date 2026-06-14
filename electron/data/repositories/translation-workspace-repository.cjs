const {
  mapPageRow,
  mapProjectRow,
  parseJson,
  mapTextUnitRow,
} = require("./mappers.cjs");
const { ChapterRepository } = require("./chapter-repository.cjs");
const { DictionaryRepository } = require("./dictionary-repository.cjs");
const { TextCompositionRepository } = require("./text-composition-repository.cjs");

const DEFAULT_TEXT_UNIT_FONT_SIZE = 18;
const MIN_TEXT_UNIT_FONT_SIZE = 8;
const MAX_TEXT_UNIT_FONT_SIZE = 360;
const MIN_TEXT_BOX_WIDTH = 16;
const MIN_TEXT_BOX_HEIGHT = 12;
const DEFAULT_COMPOSITION_FONT_FAMILY = "JF Flat";
const DEFAULT_COMPOSITION_FONT_WEIGHT = 800;
const NORMAL_DIALOGUE_PRESET_ID = "text_preset_global_normal_dialogue";
const BLACK_BUBBLE_PRESET_ID = "text_preset_global_black_bubble";
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 96;
const MIN_BRUSH_POINTS = 2;

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

function editMarkId() {
  return `page_mark_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function roundBoxCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function normalizeRegionBox(value, fallback) {
  const parsed = typeof value === "string" ? parseJson(value, fallback) : value;
  const box = parsed && typeof parsed === "object" ? parsed : fallback;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite)) return fallback;
  return {
    type: "box",
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(MIN_TEXT_BOX_WIDTH, width),
    height: Math.max(MIN_TEXT_BOX_HEIGHT, height),
  };
}

function normalizeTextBox(value, fallback, pageWidth, pageHeight) {
  const pageW = Number(pageWidth);
  const pageH = Number(pageHeight);
  const hasPageBounds = Number.isFinite(pageW) && Number.isFinite(pageH) && pageW > 0 && pageH > 0;
  const rawBox = normalizeRegionBox(value, fallback);
  if (!hasPageBounds) {
    return {
      ...rawBox,
      x: roundBoxCoordinate(rawBox.x),
      y: roundBoxCoordinate(rawBox.y),
      width: roundBoxCoordinate(rawBox.width),
      height: roundBoxCoordinate(rawBox.height),
    };
  }

  const width = Math.min(Math.max(MIN_TEXT_BOX_WIDTH, rawBox.width), pageW);
  const height = Math.min(Math.max(MIN_TEXT_BOX_HEIGHT, rawBox.height), pageH);
  const x = Math.max(0, Math.min(rawBox.x, pageW - width));
  const y = Math.max(0, Math.min(rawBox.y, pageH - height));

  return {
    type: "box",
    x: roundBoxCoordinate(x),
    y: roundBoxCoordinate(y),
    width: roundBoxCoordinate(width),
    height: roundBoxCoordinate(height),
  };
}

function normalizeBrushSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 18;
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(numeric * 100) / 100));
}

function normalizeOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.05, Math.min(1, Math.round(numeric * 100) / 100));
}

function normalizeColor(value) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return "#FFFFFF";
}

function normalizeOptionalColor(value, fallback = undefined) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function textCompositionIdForTextUnit(textUnitId) {
  return `text_composition_${textUnitId}`;
}

function presetIdForTypesetting(typesetting, compositionInput = {}) {
  if (compositionInput.presetId !== undefined) return compositionInput.presetId;
  return String(typesetting.color ?? "").toUpperCase() === "#F7F2E8"
    ? BLACK_BUBBLE_PRESET_ID
    : NORMAL_DIALOGUE_PRESET_ID;
}

function styleFromTypesetting(typesetting) {
  return {
    color: normalizeOptionalColor(typesetting.color, "#17110B"),
    fontFamily: DEFAULT_COMPOSITION_FONT_FAMILY,
    fontSize: normalizeFontSize(typesetting.fontSize),
    fontWeight: DEFAULT_COMPOSITION_FONT_WEIGHT,
    opacity: 1,
  };
}

function defaultCompositionLayout() {
  return {
    allowWordBreak: false,
    align: "center",
    direction: "auto",
    fitMode: "shrink_to_fit",
    lineHeight: 1.28,
    maxLines: null,
    paddingX: 5,
    paddingY: 4,
    rotation: 0,
    verticalAlign: "middle",
    wrapMode: "word",
  };
}

function normalizeCompositionSource(value) {
  const normalized = String(value ?? "auto").trim();
  if (["auto", "henry", "manual", "legacy", "imported"].includes(normalized)) return normalized;
  return "auto";
}

function normalizeCompositionKind(value) {
  const normalized = String(value ?? "dialogue").trim();
  if (["dialogue", "thought", "narration", "shout", "whisper", "aside", "sfx", "title", "sign", "unknown"].includes(normalized)) {
    return normalized;
  }
  return "dialogue";
}

function normalizeEditPoints(points, pageWidth, pageHeight) {
  const pageW = Number(pageWidth);
  const pageH = Number(pageHeight);
  const hasBounds = Number.isFinite(pageW) && Number.isFinite(pageH) && pageW > 0 && pageH > 0;
  return (Array.isArray(points) ? points : [])
    .map((point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: roundBoxCoordinate(hasBounds ? Math.max(0, Math.min(pageW, x)) : Math.max(0, x)),
        y: roundBoxCoordinate(hasBounds ? Math.max(0, Math.min(pageH, y)) : Math.max(0, y)),
      };
    })
    .filter(Boolean);
}

function mapPageEditMarkRow(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageId: row.page_id,
    kind: row.kind ?? "brush",
    color: normalizeColor(row.color),
    size: normalizeBrushSize(row.size),
    opacity: normalizeOpacity(row.opacity),
    points: parseJson(row.points_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPageCleanPatchRow(row) {
  const metadata = parseJson(row.metadata_json, undefined);
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
    method: row.method ?? "telea",
    maskExpansion: Number(row.mask_expansion ?? 4),
    metadata,
    feather: Number(row.feather ?? 2),
    opacity: normalizeOpacity(row.opacity),
    patchUrl: row.patch_path,
    region: normalizeRegionBox(parseJson(row.region_json, null), {
      type: "box",
      x: 0,
      y: 0,
      width: 16,
      height: 12,
    }),
    sourceOcrRunId: row.source_ocr_run_id ?? undefined,
    sourceTextUnitId: row.source_text_unit_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function offsetRegionJson(value, offsetX, offsetY) {
  const region = normalizeRegionBox(parseJson(value, null), {
    type: "box",
    x: 0,
    y: 0,
    width: 16,
    height: 12,
  });
  return JSON.stringify({
    ...region,
    x: roundBoxCoordinate(region.x + Number(offsetX ?? 0)),
    y: roundBoxCoordinate(region.y + Number(offsetY ?? 0)),
  });
}

function offsetPointsJson(value, offsetX, offsetY) {
  return JSON.stringify(parseJson(value, []).map((point) => ({
    ...point,
    x: roundBoxCoordinate(Number(point.x ?? 0) + Number(offsetX ?? 0)),
    y: roundBoxCoordinate(Number(point.y ?? 0) + Number(offsetY ?? 0)),
  })));
}

function offsetTextUnitRowForMergedPage(row) {
  if (!row.merged_page_id) return row;
  const offsetX = Number(row.merge_offset_x ?? 0);
  const offsetY = Number(row.merge_offset_y ?? 0);
  return {
    ...row,
    page_id: row.merged_page_id,
    region_json: offsetRegionJson(row.region_json, offsetX, offsetY),
    typesetting_box_json: row.typesetting_box_json
      ? offsetRegionJson(row.typesetting_box_json, offsetX, offsetY)
      : row.typesetting_box_json,
  };
}

function offsetEditMarkRowForMergedPage(row, mergeOffsetsByPage) {
  const offset = mergeOffsetsByPage.get(row.page_id);
  if (!offset) return row;
  return {
    ...row,
    page_id: offset.mergedPageId,
    points_json: row.points_json ? offsetPointsJson(row.points_json, offset.x, offset.y) : row.points_json,
  };
}

function offsetCleanPatchRowForMergedPage(row, mergeOffsetsByPage) {
  const offset = mergeOffsetsByPage.get(row.page_id);
  if (!offset) return row;
  return {
    ...row,
    page_id: offset.mergedPageId,
    region_json: offsetRegionJson(row.region_json, offset.x, offset.y),
  };
}

class TranslationWorkspaceRepository {
  constructor(db) {
    this.db = db;
    this.chapterRepository = new ChapterRepository(db);
    this.dictionaryRepository = new DictionaryRepository(db);
    this.textCompositionRepository = new TextCompositionRepository(db);
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
    const mergedPageCount = Number(this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM pages
      WHERE chapter_id = ? AND page_kind = 'merged'
    `).get(chapterId)?.count ?? 0);
    const pageKindFilter = mergedPageCount > 0 ? "merged" : "original";
    const mergeOffsets = mergedPageCount > 0
      ? this.db.prepare(`
          SELECT
            merged_page_id,
            source_page_id,
            x,
            y,
            width,
            height
          FROM page_merge_sources
          WHERE merged_page_id IN (
            SELECT id FROM pages WHERE chapter_id = ? AND page_kind = 'merged'
          )
        `).all(chapterId)
      : [];
    const mergeOffsetsByPage = new Map(mergeOffsets.map((row) => [
      row.source_page_id,
      {
        height: Number(row.height ?? 0),
        mergedPageId: row.merged_page_id,
        width: Number(row.width ?? 0),
        x: Number(row.x ?? 0),
        y: Number(row.y ?? 0),
      },
    ]));
    const pages = totalPages > 0 && totalPages === localPages
      ? this.db.prepare(`
          SELECT p.*, a.path AS asset_path, a.metadata_json AS asset_metadata_json
          FROM pages p
          JOIN assets a ON a.id = p.asset_id
          WHERE p.chapter_id = ?
            AND COALESCE(p.page_kind, 'original') = ?
          ORDER BY p.page_index ASC
        `).all(chapterId, pageKindFilter).map(mapPageRow)
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
          SELECT COALESCE(json_extract(oc.region_json, '$.provider'), ocr.provider)
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
        ) AS typesetting_font_size,
        (
          SELECT ti.box_json
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS typesetting_box_json,
        (
          SELECT ti.style_json
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS typesetting_style_json,
        (
          SELECT ca.status
          FROM clean_attempts ca
          WHERE ca.text_unit_id = tu.id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS clean_status,
        (
          SELECT ca.classification
          FROM clean_attempts ca
          WHERE ca.text_unit_id = tu.id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS clean_classification,
        (
          SELECT ca.error_message
          FROM clean_attempts ca
          WHERE ca.text_unit_id = tu.id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS clean_reason,
        pms.merged_page_id,
        pms.x AS merge_offset_x,
        pms.y AS merge_offset_y
      FROM text_units tu
      LEFT JOIN page_merge_sources pms ON pms.source_page_id = tu.page_id
      WHERE tu.chapter_id = ?
      ORDER BY tu.unit_order ASC
    `).all(chapterId).map((row) => mapTextUnitRow(offsetTextUnitRowForMergedPage(row)));

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
    const textCompositions = this.textCompositionRepository.listChapterCompositions(chapterId, {
      mergeOffsetsByPage,
    });
    const textStylePresets = this.textCompositionRepository.listTextStylePresets(chapter.projectId);

    const pageEditMarks = this.db.prepare(`
      SELECT *
      FROM page_edit_marks
      WHERE chapter_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(chapterId)
      .map((row) => offsetEditMarkRowForMergedPage(row, mergeOffsetsByPage))
      .map(mapPageEditMarkRow);
    const pageCleanPatches = this.db.prepare(`
      SELECT *
      FROM page_clean_patches
      WHERE chapter_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(chapterId)
      .map((row) => offsetCleanPatchRowForMergedPage(row, mergeOffsetsByPage))
      .map(mapPageCleanPatchRow);
    const pageEdits = [...pageEditMarks, ...pageCleanPatches].sort((first, second) => {
      const byDate = String(first.createdAt).localeCompare(String(second.createdAt));
      return byDate === 0 ? String(first.id).localeCompare(String(second.id)) : byDate;
    });

    const dictionary = this.dictionaryRepository.getProjectDictionary(chapter.projectId);

    return {
      project,
      chapter,
      pages,
      pageEditMarks: pageEdits,
      textCompositions,
      textStylePresets,
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
          SELECT COALESCE(json_extract(oc.region_json, '$.provider'), ocr.provider)
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
        ) AS typesetting_font_size,
        (
          SELECT ti.box_json
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS typesetting_box_json,
        (
          SELECT ti.style_json
          FROM typesetting_items ti
          WHERE ti.text_unit_id = tu.id
          ORDER BY ti.updated_at DESC
          LIMIT 1
        ) AS typesetting_style_json
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

  getTextUnitTypesettingState(textUnitId) {
    return this.db.prepare(`
      SELECT
        tu.id,
        tu.chapter_id,
        tu.page_id,
        tu.unit_order,
        tu.region_json,
        p.width AS page_width,
        p.height AS page_height,
        ti.font_size,
        ti.box_json,
        ti.style_json,
        pms.merged_page_id,
        pms.x AS merge_offset_x,
        pms.y AS merge_offset_y
      FROM text_units tu
      JOIN pages p ON p.id = tu.page_id
      LEFT JOIN typesetting_items ti ON ti.id = ?
      LEFT JOIN page_merge_sources pms ON pms.source_page_id = tu.page_id
      WHERE tu.id = ?
    `).get(`typesetting_${textUnitId}`, textUnitId);
  }

  normalizeTypesetting(row, input = {}) {
    const nextInput = input ?? {};
    const fallbackBox = normalizeRegionBox(row.region_json, {
      type: "box",
      x: 0,
      y: 0,
      width: 120,
      height: 60,
    });
    const hasFontSize = nextInput.fontSize != null;
    const hasBox = nextInput.box != null;
    const hasColor = nextInput.color != null;
    const currentStyle = parseJson(row.style_json, {});
    const currentColor = normalizeOptionalColor(currentStyle.color);
    const offsetX = row.merged_page_id ? Number(row.merge_offset_x ?? 0) : 0;
    const offsetY = row.merged_page_id ? Number(row.merge_offset_y ?? 0) : 0;
    const inputBox = nextInput.box && row.merged_page_id
      ? {
        ...nextInput.box,
        x: Number(nextInput.box.x ?? 0) - offsetX,
        y: Number(nextInput.box.y ?? 0) - offsetY,
      }
      : nextInput.box;
    return {
      box: normalizeTextBox(
        hasBox ? inputBox : row.box_json,
        fallbackBox,
        row.page_width,
        row.page_height,
      ),
      fontSize: normalizeFontSize(hasFontSize ? nextInput.fontSize : row.font_size),
      color: normalizeOptionalColor(hasColor ? nextInput.color : currentColor, currentColor ?? "#17110B"),
    };
  }

  upsertTextUnitTypesettingItem(textUnitId, typesetting, timestamp) {
    this.db.prepare(`
      INSERT INTO typesetting_items (
        id, text_unit_id, font_family, font_size, font_weight, align, box_json, style_json, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        font_size = excluded.font_size,
        box_json = excluded.box_json,
        style_json = excluded.style_json,
        updated_at = excluded.updated_at
    `).run(
      `typesetting_${textUnitId}`,
      textUnitId,
      typesetting.fontSize,
      JSON.stringify(typesetting.box),
      JSON.stringify(typesetting),
      timestamp,
      timestamp,
    );
    return typesetting;
  }

  upsertTextCompositionForTypesetting(textUnitId, existing, typesetting, input = {}) {
    const compositionInput = input?.composition;
    if (!compositionInput?.enabled) return null;

    const plainText = String(compositionInput.plainText ?? "").trim();
    if (!plainText) return null;

    return this.textCompositionRepository.upsertTextComposition({
      box: typesetting.box,
      chapterId: existing.chapter_id,
      effects: null,
      id: textCompositionIdForTextUnit(textUnitId),
      kind: normalizeCompositionKind(compositionInput.kind),
      layout: defaultCompositionLayout(),
      manualFields: Array.isArray(compositionInput.manualFields) ? compositionInput.manualFields : [],
      origin: compositionInput.origin ?? {
        createdBy: normalizeCompositionSource(compositionInput.source),
      },
      pageId: existing.page_id,
      plainText,
      presetId: presetIdForTypesetting(typesetting, compositionInput),
      renderOrder: Number(existing.unit_order ?? 0),
      source: normalizeCompositionSource(compositionInput.source),
      style: styleFromTypesetting(typesetting),
      textUnitId,
    });
  }

  updateTextUnitTypesetting(textUnitId, input) {
    const existing = this.getTextUnitTypesettingState(textUnitId);

    if (!existing) {
      throw new Error("Text unit not found");
    }

    const timestamp = new Date().toISOString();
    const typesetting = this.normalizeTypesetting(existing, input);

    this.db.exec("BEGIN");
    try {
      this.upsertTextUnitTypesettingItem(textUnitId, typesetting, timestamp);
      this.upsertTextCompositionForTypesetting(textUnitId, existing, typesetting, input);
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

    const displayBox = existing.merged_page_id
      ? {
        ...typesetting.box,
        x: roundBoxCoordinate(typesetting.box.x + Number(existing.merge_offset_x ?? 0)),
        y: roundBoxCoordinate(typesetting.box.y + Number(existing.merge_offset_y ?? 0)),
      }
      : typesetting.box;

    return {
      box: displayBox,
      chapterId: existing.chapter_id,
      color: typesetting.color,
      fontSize: typesetting.fontSize,
      id: textUnitId,
    };
  }

  getTextCompositionUpdateState(compositionId) {
    return this.db.prepare(`
      SELECT
        tc.id,
        tc.chapter_id,
        tc.page_id,
        tc.text_unit_id,
        pms.merged_page_id,
        pms.x AS merge_offset_x,
        pms.y AS merge_offset_y
      FROM text_compositions tc
      LEFT JOIN page_merge_sources pms ON pms.source_page_id = tc.page_id
      WHERE tc.id = ?
    `).get(compositionId);
  }

  displayCompositionForMergeState(composition, state) {
    if (!composition || !state?.merged_page_id) return composition;
    return {
      ...composition,
      box: {
        ...composition.box,
        x: roundBoxCoordinate(composition.box.x + Number(state.merge_offset_x ?? 0)),
        y: roundBoxCoordinate(composition.box.y + Number(state.merge_offset_y ?? 0)),
      },
      pageId: state.merged_page_id,
    };
  }

  updateLegacyTypesettingForComposition(state, composition, timestamp) {
    if (!state?.text_unit_id || !composition) return;
    const existing = this.getTextUnitTypesettingState(state.text_unit_id);
    if (!existing) return;

    const currentTypesetting = this.normalizeTypesetting(existing);
    this.upsertTextUnitTypesettingItem(state.text_unit_id, {
      ...currentTypesetting,
      box: composition.box,
      color: normalizeOptionalColor(composition.style?.color, currentTypesetting.color),
      fontSize: normalizeFontSize(composition.style?.fontSize ?? currentTypesetting.fontSize),
    }, timestamp);
    this.db.prepare("UPDATE text_units SET updated_at = ? WHERE id = ?").run(timestamp, state.text_unit_id);
  }

  updateTextComposition(compositionId, input = {}) {
    const state = this.getTextCompositionUpdateState(compositionId);
    if (!state) throw new Error("Text composition not found");

    const adjustedInput = { ...(input ?? {}) };
    if (adjustedInput.box && state.merged_page_id) {
      adjustedInput.box = {
        ...adjustedInput.box,
        x: roundBoxCoordinate(Number(adjustedInput.box.x ?? 0) - Number(state.merge_offset_x ?? 0)),
        y: roundBoxCoordinate(Number(adjustedInput.box.y ?? 0) - Number(state.merge_offset_y ?? 0)),
      };
    }

    const timestamp = new Date().toISOString();
    let composition;
    this.db.exec("BEGIN");
    try {
      composition = this.textCompositionRepository.updateTextComposition(compositionId, adjustedInput);
      this.updateLegacyTypesettingForComposition(state, composition, timestamp);
      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, state.chapter_id);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, state.chapter_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.displayCompositionForMergeState(composition, state);
  }

  touchProject(projectId, timestamp) {
    if (!projectId) return;
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, projectId);
  }

  touchChapterAndProject(chapterId, timestamp) {
    if (!chapterId) return;
    this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, chapterId);
    this.db.prepare(`
      UPDATE projects
      SET updated_at = ?
      WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
    `).run(timestamp, chapterId);
  }

  createTextStylePreset(input = {}) {
    const timestamp = new Date().toISOString();
    let preset;
    this.db.exec("BEGIN");
    try {
      preset = this.textCompositionRepository.createTextStylePreset(input);
      this.touchProject(preset.projectId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return preset;
  }

  updateTextStylePreset(presetId, input = {}) {
    const timestamp = new Date().toISOString();
    let preset;
    this.db.exec("BEGIN");
    try {
      preset = this.textCompositionRepository.updateTextStylePreset(presetId, input);
      this.touchProject(preset.projectId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return preset;
  }

  deleteTextStylePreset(presetId) {
    const timestamp = new Date().toISOString();
    let result;
    this.db.exec("BEGIN");
    try {
      result = this.textCompositionRepository.deleteTextStylePreset(presetId);
      this.touchProject(result.projectId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return result;
  }

  applyTextStylePresetToSameKind(chapterId, input = {}) {
    const timestamp = new Date().toISOString();
    let result;
    this.db.exec("BEGIN");
    try {
      result = this.textCompositionRepository.applyTextStylePresetToSameKind(chapterId, input);
      if (result.updated > 0) this.touchChapterAndProject(chapterId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return result;
  }

  addPageEditMark(input) {
    const page = this.db.prepare(`
      SELECT p.id, p.chapter_id, p.width, p.height
      FROM pages p
      WHERE p.id = ?
    `).get(String(input?.pageId ?? ""));

    if (!page) {
      throw new Error("Page not found");
    }

    const points = normalizeEditPoints(input?.points, page.width, page.height);
    if (points.length < MIN_BRUSH_POINTS) {
      throw new Error("Drawing stroke is too short");
    }

    const timestamp = new Date().toISOString();
    const mark = {
      id: editMarkId(),
      chapterId: page.chapter_id,
      pageId: page.id,
      kind: "brush",
      color: normalizeColor(input?.color),
      size: normalizeBrushSize(input?.size),
      opacity: normalizeOpacity(input?.opacity),
      points,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO page_edit_marks (
          id, chapter_id, page_id, kind, color, size, opacity, points_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mark.id,
        mark.chapterId,
        mark.pageId,
        mark.kind,
        mark.color,
        mark.size,
        mark.opacity,
        JSON.stringify(mark.points),
        timestamp,
        timestamp,
      );

      this.db.prepare("UPDATE chapters SET updated_at = ? WHERE id = ?").run(timestamp, mark.chapterId);
      this.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, mark.chapterId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return mark;
  }

  deletePageEditMark(markId) {
    const existing = this.db.prepare(`
      SELECT id, chapter_id, page_id, 'brush' AS source
      FROM page_edit_marks
      WHERE id = ?
      UNION ALL
      SELECT id, chapter_id, page_id, 'clean_patch' AS source
      FROM page_clean_patches
      WHERE id = ?
    `).get(markId, markId);

    if (!existing) {
      throw new Error("Page edit mark not found");
    }

    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      if (existing.source === "clean_patch") {
        this.db.prepare("DELETE FROM page_clean_patches WHERE id = ?").run(markId);
      } else {
        this.db.prepare("DELETE FROM page_edit_marks WHERE id = ?").run(markId);
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
      id: existing.id,
      pageId: existing.page_id,
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
        tu.region_json,
        p.width AS page_width,
        p.height AS page_height,
        ti.font_size,
        ti.box_json,
        ti.style_json
      FROM text_units tu
      JOIN pages p ON p.id = tu.page_id
      LEFT JOIN typesetting_items ti ON ti.id = 'typesetting_' || tu.id
      WHERE tu.chapter_id = ?
      ORDER BY tu.unit_order ASC
    `).all(chapterId);

    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        const currentTypesetting = this.normalizeTypesetting(row);
        this.upsertTextUnitTypesettingItem(row.id, {
          ...currentTypesetting,
          fontSize: normalizeFontSize(currentTypesetting.fontSize + delta),
        }, timestamp);
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
