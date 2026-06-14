function textCompositionId() {
  return `text_composition_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function roundCoordinate(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeColor(value, fallback = "#17110B") {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function normalizeFontSize(value, fallback = 18) {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.max(8, Math.min(360, Math.round(size)));
}

function normalizeBox(value, fallback = { type: "box", x: 0, y: 0, width: 16, height: 12 }) {
  const box = typeof value === "string" ? parseJson(value, fallback) : value;
  const x = Number(box?.x);
  const y = Number(box?.y);
  const width = Number(box?.width);
  const height = Number(box?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return fallback;
  return {
    type: "box",
    x: roundCoordinate(Math.max(0, x)),
    y: roundCoordinate(Math.max(0, y)),
    width: roundCoordinate(Math.max(1, width)),
    height: roundCoordinate(Math.max(1, height)),
  };
}

const MANUAL_FIELD_SET = new Set([
  "plainText",
  "content",
  "box",
  "preset",
  "kind",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "opacity",
  "stroke",
  "shadow",
  "background",
  "layout",
  "effects",
  "renderOrder",
]);

const PRESET_RESET_FIELDS = [
  "preset",
  "kind",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "opacity",
  "stroke",
  "shadow",
  "background",
  "layout",
  "effects",
];

function normalizeManualFields(fields) {
  return Array.from(new Set((Array.isArray(fields) ? fields : [])
    .map((field) => String(field ?? "").trim())
    .filter((field) => MANUAL_FIELD_SET.has(field))));
}

function addManualFields(fields, nextFields) {
  return normalizeManualFields([...normalizeManualFields(fields), ...nextFields]);
}

function removeManualFields(fields, fieldsToRemove) {
  const removeSet = new Set(fieldsToRemove);
  return normalizeManualFields(fields).filter((field) => !removeSet.has(field));
}

function normalizeStroke(input, fallback = {}) {
  const enabled = input?.enabled == null ? Boolean(fallback?.enabled) : Boolean(input.enabled);
  return {
    color: normalizeColor(input?.color, normalizeColor(fallback?.color, "#FFFFFF")),
    enabled,
    opacity: clamp(input?.opacity ?? fallback?.opacity ?? 1, 0, 1),
    width: roundCoordinate(Math.max(0, Number(input?.width ?? fallback?.width ?? 2))),
  };
}

function offsetBoxJson(value, offsetX, offsetY) {
  const box = normalizeBox(parseJson(value, null));
  return JSON.stringify({
    ...box,
    x: roundCoordinate(box.x + Number(offsetX ?? 0)),
    y: roundCoordinate(box.y + Number(offsetY ?? 0)),
  });
}

function mapPresetRow(row) {
  return {
    createdAt: row.created_at,
    effects: parseJson(row.effect_json, undefined),
    id: row.id,
    isDefault: Boolean(row.is_default),
    kind: row.kind,
    layout: parseJson(row.layout_json, {}),
    name: row.name,
    projectId: row.project_id ?? null,
    style: parseJson(row.style_json, {}),
    updatedAt: row.updated_at,
  };
}

function mapCompositionRow(row) {
  return {
    box: normalizeBox(row.box_json),
    chapterId: row.chapter_id,
    content: parseJson(row.content_json, null),
    createdAt: row.created_at,
    effects: parseJson(row.effect_json, undefined),
    id: row.id,
    isLocked: Boolean(row.is_locked),
    kind: row.kind,
    layout: parseJson(row.layout_json, {}),
    manualFields: parseJson(row.manual_fields_json, []),
    origin: parseJson(row.origin_json, null),
    pageId: row.page_id,
    plainText: row.plain_text,
    presetId: row.preset_id ?? null,
    renderOrder: Number(row.render_order ?? 0),
    source: row.source,
    style: parseJson(row.style_json, {}),
    textUnitId: row.text_unit_id ?? null,
    updatedAt: row.updated_at,
  };
}

function offsetCompositionRowForMergedPage(row, mergeOffsetsByPage) {
  const offset = mergeOffsetsByPage?.get?.(row.page_id);
  if (!offset) return row;
  return {
    ...row,
    box_json: offsetBoxJson(row.box_json, offset.x, offset.y),
    page_id: offset.mergedPageId,
  };
}

class TextCompositionRepository {
  constructor(db) {
    this.db = db;
  }

  listTextStylePresets(projectId = null) {
    if (projectId) {
      return this.db.prepare(`
        SELECT *
        FROM text_style_presets
        WHERE project_id IS NULL OR project_id = ?
        ORDER BY project_id IS NULL DESC, kind ASC, is_default DESC, name ASC
      `).all(projectId).map(mapPresetRow);
    }

    return this.db.prepare(`
      SELECT *
      FROM text_style_presets
      WHERE project_id IS NULL
      ORDER BY kind ASC, is_default DESC, name ASC
    `).all().map(mapPresetRow);
  }

  listChapterCompositions(chapterId, options = {}) {
    const mergeOffsetsByPage = options.mergeOffsetsByPage ?? new Map();
    return this.db.prepare(`
      SELECT *
      FROM text_compositions
      WHERE chapter_id = ?
      ORDER BY render_order ASC, created_at ASC, id ASC
    `).all(chapterId)
      .map((row) => offsetCompositionRowForMergedPage(row, mergeOffsetsByPage))
      .map(mapCompositionRow);
  }

  getTextStylePreset(presetId) {
    const id = String(presetId ?? "").trim();
    if (!id) return null;
    const row = this.db.prepare("SELECT * FROM text_style_presets WHERE id = ?").get(id);
    return row ? mapPresetRow(row) : null;
  }

  getTextComposition(compositionId) {
    const id = String(compositionId ?? "").trim();
    if (!id) return null;
    const row = this.db.prepare("SELECT * FROM text_compositions WHERE id = ?").get(id);
    return row ? mapCompositionRow(row) : null;
  }

  upsertTextComposition(input) {
    const timestamp = new Date().toISOString();
    const id = String(input?.id ?? "").trim() || textCompositionId();
    const chapterId = String(input?.chapterId ?? "").trim();
    const pageId = String(input?.pageId ?? "").trim();
    const plainText = String(input?.plainText ?? "");
    if (!chapterId) throw new Error("Text composition chapter is required");
    if (!pageId) throw new Error("Text composition page is required");

    const box = normalizeBox(input?.box);
    const style = input?.style && typeof input.style === "object" ? input.style : {};
    const layout = input?.layout && typeof input.layout === "object" ? input.layout : {};
    const manualFields = Array.isArray(input?.manualFields) ? input.manualFields : [];

    this.db.prepare(`
      INSERT INTO text_compositions (
        id, chapter_id, page_id, text_unit_id, preset_id, kind, plain_text, content_json, source,
        box_json, style_json, layout_json, effect_json, manual_fields_json, origin_json,
        render_order, is_locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        chapter_id = excluded.chapter_id,
        page_id = excluded.page_id,
        text_unit_id = excluded.text_unit_id,
        preset_id = excluded.preset_id,
        kind = excluded.kind,
        plain_text = excluded.plain_text,
        content_json = excluded.content_json,
        source = excluded.source,
        box_json = excluded.box_json,
        style_json = excluded.style_json,
        layout_json = excluded.layout_json,
        effect_json = excluded.effect_json,
        manual_fields_json = excluded.manual_fields_json,
        origin_json = excluded.origin_json,
        render_order = excluded.render_order,
        is_locked = excluded.is_locked,
        updated_at = excluded.updated_at
    `).run(
      id,
      chapterId,
      pageId,
      input?.textUnitId ?? null,
      input?.presetId ?? null,
      String(input?.kind ?? "dialogue"),
      plainText,
      input?.content ? JSON.stringify(input.content) : null,
      String(input?.source ?? "auto"),
      JSON.stringify(box),
      JSON.stringify(style),
      JSON.stringify(layout),
      input?.effects ? JSON.stringify(input.effects) : null,
      JSON.stringify(manualFields),
      input?.origin ? JSON.stringify(input.origin) : null,
      Number(input?.renderOrder ?? 0),
      input?.isLocked ? 1 : 0,
      timestamp,
      timestamp,
    );

    return mapCompositionRow(this.db.prepare("SELECT * FROM text_compositions WHERE id = ?").get(id));
  }

  updateTextComposition(compositionId, input = {}) {
    const id = String(compositionId ?? "").trim();
    if (!id) throw new Error("Text composition id is required");

    const row = this.db.prepare("SELECT * FROM text_compositions WHERE id = ?").get(id);
    if (!row) throw new Error("Text composition not found");

    const timestamp = new Date().toISOString();
    let box = normalizeBox(row.box_json);
    let kind = String(row.kind ?? "dialogue");
    let presetId = row.preset_id ?? null;
    let style = parseJson(row.style_json, {});
    let layout = parseJson(row.layout_json, {});
    let effects = parseJson(row.effect_json, undefined);
    let manualFields = normalizeManualFields(parseJson(row.manual_fields_json, []));

    const applyPreset = (nextPresetId, { resetManualFields = false } = {}) => {
      const preset = this.getTextStylePreset(nextPresetId);
      if (!preset) throw new Error("Text style preset not found");
      presetId = preset.id;
      kind = preset.kind;
      style = preset.style ?? {};
      layout = preset.layout ?? {};
      effects = preset.effects;
      manualFields = resetManualFields
        ? removeManualFields(manualFields, PRESET_RESET_FIELDS)
        : addManualFields(manualFields, ["preset"]);
    };

    if (input?.resetToPreset) {
      const resetPresetId = input?.presetId !== undefined ? input.presetId : presetId;
      if (!resetPresetId) throw new Error("Text composition has no preset to reset");
      applyPreset(resetPresetId, { resetManualFields: true });
    } else if (input?.presetId !== undefined) {
      if (input.presetId) {
        applyPreset(input.presetId);
      } else {
        presetId = null;
        manualFields = addManualFields(manualFields, ["preset"]);
      }
    }

    if (input?.box) {
      box = normalizeBox(input.box, box);
      manualFields = addManualFields(manualFields, ["box"]);
    }

    if (input?.kind) {
      kind = String(input.kind);
      manualFields = addManualFields(manualFields, ["kind"]);
    }

    if (input?.fontSize != null) {
      style = {
        ...style,
        fontSize: normalizeFontSize(input.fontSize, normalizeFontSize(style.fontSize)),
      };
      manualFields = addManualFields(manualFields, ["fontSize"]);
    }

    if (input?.color != null) {
      style = {
        ...style,
        color: normalizeColor(input.color, normalizeColor(style.color)),
      };
      manualFields = addManualFields(manualFields, ["color"]);
    }

    if (input?.stroke) {
      const stroke = normalizeStroke(input.stroke, effects?.stroke ?? style?.stroke);
      style = {
        ...style,
        stroke,
      };
      effects = {
        ...(effects ?? {}),
        stroke,
      };
      manualFields = addManualFields(manualFields, ["stroke"]);
    }

    this.db.prepare(`
      UPDATE text_compositions
      SET
        preset_id = ?,
        kind = ?,
        box_json = ?,
        style_json = ?,
        layout_json = ?,
        effect_json = ?,
        manual_fields_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      presetId,
      kind,
      JSON.stringify(box),
      JSON.stringify(style),
      JSON.stringify(layout),
      effects ? JSON.stringify(effects) : null,
      JSON.stringify(manualFields),
      timestamp,
      id,
    );

    return this.getTextComposition(id);
  }

  deleteTextComposition(compositionId) {
    const id = String(compositionId ?? "").trim();
    if (!id) throw new Error("Text composition id is required");
    const result = this.db.prepare("DELETE FROM text_compositions WHERE id = ?").run(id);
    return {
      deleted: Number(result.changes ?? 0),
      id,
    };
  }
}

module.exports = {
  TextCompositionRepository,
  mapCompositionRow,
  mapPresetRow,
};
