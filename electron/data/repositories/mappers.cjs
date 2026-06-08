function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function coverToneFromMetadata(metadataJson, fallback = "steel") {
  return parseJson(metadataJson, {}).tone ?? fallback;
}

function mapProjectRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    arabicTitle: row.arabic_title ?? undefined,
    originalTitle: row.original_title ?? row.title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    coverTone: coverToneFromMetadata(row.cover_metadata_json),
    coverUrl: row.cover_asset_path ?? null,
    status: row.status,
    lastWorkedChapterId: row.last_worked_chapter_id ?? undefined,
    lastWorkedChapterLabel: row.last_worked_chapter_label ?? undefined,
    lastModifiedAt: row.updated_at,
    progress: Number(row.progress ?? 0),
  };
}

function mapChapterRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.number,
    title: row.title ?? undefined,
    displayLabel: row.display_label,
    status: row.status,
    internalStatus: row.internal_status,
    downloadStatus: row.download_status ?? "Not Downloaded",
    downloadError: row.download_error ?? undefined,
    downloadedAt: row.downloaded_at ?? undefined,
    pagesCount: Number(row.pages_count ?? 0),
    textUnitsCount: Number(row.text_units_count ?? 0),
    progress: Number(row.progress ?? 0),
    updatedAt: row.updated_at,
  };
}

function mapCharacterRow(row, aliases = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    englishName: row.english_name,
    arabicName: row.arabic_name,
    gender: row.gender,
    aliases,
    description: row.description ?? undefined,
  };
}

function mapAliasRow(row) {
  return {
    id: row.id,
    english: row.english_alias,
    arabic: row.arabic_alias,
  };
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
  };
}

function mapGlossaryTermRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    englishTerm: row.english_term,
    arabicTerm: row.arabic_term,
    category: row.category ?? row.category_name ?? "General Term",
    description: row.description ?? undefined,
  };
}

function mapPageRow(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    index: Number(row.page_index),
    imageTone: coverToneFromMetadata(row.asset_metadata_json, "night"),
    imageUrl: row.asset_path ?? null,
    width: Number(row.width ?? 820),
    height: Number(row.height ?? 1240),
  };
}

function mapTextUnitRow(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageId: row.page_id,
    order: Number(row.unit_order),
    region: parseJson(row.region_json, { type: "box", x: 0, y: 0, width: 120, height: 60 }),
    sourceText: row.source_final_text ?? row.source_ocr_text ?? "",
    aiTranslation: row.ai_translation ?? "",
    microsoftTranslation: row.microsoft_translation ?? "",
    ocrConfidence: row.ocr_confidence == null ? undefined : Number(row.ocr_confidence),
    ocrProvider: row.ocr_provider ?? undefined,
    sourceStatus: row.source_status ?? "Empty",
    finalTranslation: row.final_translation ?? "",
    reviewStatus: row.review_status,
    matchedCharacterIds: [],
    matchedGlossaryTermIds: [],
  };
}

module.exports = {
  mapAliasRow,
  mapCategoryRow,
  mapChapterRow,
  mapCharacterRow,
  mapGlossaryTermRow,
  mapPageRow,
  mapProjectRow,
  mapTextUnitRow,
  parseJson,
};
