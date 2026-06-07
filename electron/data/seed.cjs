function now() {
  return new Date().toISOString();
}

function insert(db, sql, values) {
  db.prepare(sql).run(...values);
}

function seedDatabase(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM projects").get().count;
  if (existing > 0) return;

  const createdAt = "2026-06-07T12:00:00Z";
  const updatedAt = "2026-06-07T16:40:00Z";

  db.exec("BEGIN");
  try {
    seedProjects(db, createdAt, updatedAt);
    seedAssets(db, createdAt);
    seedChapters(db, createdAt);
    seedDictionary(db, createdAt, updatedAt);
    seedTranslationWorkspace(db, createdAt, updatedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedProjects(db, createdAt, updatedAt) {
  const projects = [
    [
      "project_solo_leveling",
      "solo-leveling",
      "Solo Leveling",
      "سولو ليفلينغ",
      "Na Honjaman Level Up",
      "Korean",
      "Arabic",
      "asset_cover_solo",
      "Active",
      "chapter_012",
      createdAt,
      updatedAt,
    ],
    [
      "project_orv",
      "orv",
      "Omniscient Reader",
      "القارئ كلي المعرفة",
      "Jeonjijeok Dokja Sijeom",
      "Korean",
      "Arabic",
      "asset_cover_orv",
      "Active",
      "chapter_008",
      createdAt,
      "2026-06-06T22:10:00Z",
    ],
    [
      "project_tbate",
      "tbate",
      "The Beginning After The End",
      "البداية بعد النهاية",
      "The Beginning After The End",
      "English",
      "Arabic",
      "asset_cover_tbate",
      "Paused",
      "chapter_003",
      createdAt,
      "2026-06-05T18:25:00Z",
    ],
  ];

  for (const project of projects) {
    insert(
      db,
      `INSERT INTO projects (
        id, slug, title, arabic_title, original_title, source_language, target_language,
        cover_asset_id, status, last_worked_chapter_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      project,
    );
  }

  const metadata = [
    [
      "project_solo_leveling",
      "Chugong",
      "DUBU",
      "A hunter grows from the weakest rank into a force that reshapes the rules of the world.",
      JSON.stringify(["Action", "Fantasy", "Dungeon"]),
      "Ongoing",
      2018,
    ],
    [
      "project_orv",
      "Sing Shong",
      "Sleepy-C",
      "A reader survives inside the story he alone knows, but knowledge is not the same as control.",
      JSON.stringify(["Apocalypse", "Fantasy", "Drama"]),
      "Ongoing",
      2020,
    ],
    [
      "project_tbate",
      "TurtleMe",
      "Fuyuki23",
      "High fantasy with reincarnation and academy arcs.",
      JSON.stringify(["Fantasy", "Adventure", "Magic"]),
      "Ongoing",
      2018,
    ],
  ];

  for (const row of metadata) {
    insert(
      db,
      `INSERT INTO project_metadata (
        project_id, author, artist, description, genres_json, external_status, start_year
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }

  const contexts = [
    [
      "project_solo_leveling",
      "# Work Context\n\nModern fantasy with hunter ranks, dungeon raids, and formal combat terminology. Keep names stable and avoid casual Arabic.",
      "Modern fantasy with hunter ranks, dungeon raids, and formal combat terminology. Keep names stable and avoid casual Arabic.",
      updatedAt,
    ],
    [
      "project_orv",
      "# Work Context\n\nScenario-based apocalypse. Translation should preserve system terms and speaker distance.",
      "Scenario-based apocalypse. Translation should preserve system terms and speaker distance.",
      "2026-06-06T22:10:00Z",
    ],
    [
      "project_tbate",
      "# Work Context\n\nHigh fantasy with reincarnation and academy arcs. Keep noble ranks consistent.",
      "High fantasy with reincarnation and academy arcs. Keep noble ranks consistent.",
      "2026-06-05T18:25:00Z",
    ],
  ];

  for (const row of contexts) {
    insert(
      db,
      "INSERT INTO project_contexts (project_id, markdown, summary, updated_at) VALUES (?, ?, ?, ?)",
      row,
    );
  }
}

function seedAssets(db, createdAt) {
  const assets = [
    ["asset_cover_solo", "project_solo_leveling", "cover", "assets/projects/project_solo_leveling/cover.jpg", "image/jpeg", 480, 720, 0, null, JSON.stringify({ tone: "ember" }), createdAt],
    ["asset_cover_orv", "project_orv", "cover", "assets/projects/project_orv/cover.jpg", "image/jpeg", 480, 720, 0, null, JSON.stringify({ tone: "teal" }), createdAt],
    ["asset_cover_tbate", "project_tbate", "cover", "assets/projects/project_tbate/cover.jpg", "image/jpeg", 480, 720, 0, null, JSON.stringify({ tone: "violet" }), createdAt],
    ["asset_page_001", "project_solo_leveling", "page", "assets/projects/project_solo_leveling/chapters/chapter_012/pages/001.png", "image/png", 820, 1240, 0, null, JSON.stringify({ tone: "night" }), createdAt],
    ["asset_page_002", "project_solo_leveling", "page", "assets/projects/project_solo_leveling/chapters/chapter_012/pages/002.png", "image/png", 820, 1240, 0, null, JSON.stringify({ tone: "gate" }), createdAt],
  ];

  for (const row of assets) {
    insert(
      db,
      `INSERT INTO assets (
        id, project_id, kind, path, mime_type, width, height, size_bytes, checksum, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }
}

function seedChapters(db, createdAt) {
  const chapters = [
    ["chapter_010", "project_solo_leveling", "10", "A New Gate", "Chapter 10", "Completed", "Completed", 10, createdAt, "2026-06-01T15:22:00Z"],
    ["chapter_011", "project_solo_leveling", "11", "Raid Briefing", "Chapter 11", "In Progress", "Reviewed", 11, createdAt, "2026-06-04T19:42:00Z"],
    ["chapter_012", "project_solo_leveling", "12", "Shadow Trace", "Chapter 12", "In Progress", "Draft Translated", 12, createdAt, "2026-06-07T16:40:00Z"],
    ["chapter_013", "project_solo_leveling", "13", "The Red Gate", "Chapter 13", "Not Started", "Images Ready", 13, createdAt, "2026-06-07T12:02:00Z"],
    ["chapter_008", "project_orv", "8", "The First Scenario", "Chapter 8", "In Progress", "OCR Done", 8, createdAt, "2026-06-06T22:10:00Z"],
    ["chapter_003", "project_tbate", "3", "Second Life", "Chapter 3", "In Progress", "Human Edited", 3, createdAt, "2026-06-05T18:25:00Z"],
  ];

  for (const row of chapters) {
    insert(
      db,
      `INSERT INTO chapters (
        id, project_id, number, title, display_label, status, internal_status,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }

  const pages = [
    ["page_001", "chapter_012", "asset_page_001", 1, 820, 1240, createdAt, "2026-06-07T16:40:00Z"],
    ["page_002", "chapter_012", "asset_page_002", 2, 820, 1240, createdAt, "2026-06-07T16:40:00Z"],
  ];

  for (const row of pages) {
    insert(
      db,
      `INSERT INTO pages (
        id, chapter_id, asset_id, page_index, width, height, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }
}

function seedDictionary(db, createdAt, updatedAt) {
  const characters = [
    ["character_jinwoo", "project_solo_leveling", "Sung Jinwoo", "سونغ جين وو", "Male", "Main character. Calm, direct, and emotionally restrained.", createdAt, updatedAt],
    ["character_cha", "project_solo_leveling", "Cha Hae-In", "تشا هاي إن", "Female", "Elite hunter. Formal tone in early interactions.", createdAt, updatedAt],
    ["character_unknown", "project_solo_leveling", "Unknown Monarch", "الملك المجهول", "Unknown", null, createdAt, updatedAt],
  ];

  for (const row of characters) {
    insert(
      db,
      `INSERT INTO characters (
        id, project_id, english_name, arabic_name, gender, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }

  const aliases = [
    ["alias_jinwoo_1", "character_jinwoo", "Jinwoo", "جين وو", createdAt, updatedAt],
    ["alias_jinwoo_2", "character_jinwoo", "Hunter Sung", "الصياد سونغ", createdAt, updatedAt],
    ["alias_cha_1", "character_cha", "Hunter Cha", "الصيادة تشا", createdAt, updatedAt],
  ];

  for (const row of aliases) {
    insert(
      db,
      `INSERT INTO character_aliases (
        id, character_id, english_alias, arabic_alias, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      row,
    );
  }

  const terms = [
    ["term_shadow_monarch", "project_solo_leveling", "Title", "Shadow Monarch", "ملك الظلال", "Official title. Do not use ملك الظل.", createdAt, updatedAt],
    ["term_mana_crystal", "project_solo_leveling", "Power System", "Mana Crystal", "بلورة المانا", "Keep Mana as مانا.", createdAt, updatedAt],
    ["term_hunter_association", "project_solo_leveling", "Organization", "Hunter Association", "جمعية الصيادين", null, createdAt, updatedAt],
    ["term_shadow_exchange", "project_solo_leveling", "Skill", "Shadow Exchange", "تبادل الظل", null, createdAt, updatedAt],
  ];

  for (const row of terms) {
    insert(
      db,
      `INSERT INTO glossary_terms (
        id, project_id, category, english_term, arabic_term, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }
}

function seedTranslationWorkspace(db, createdAt, updatedAt) {
  const textUnits = [
    ["text_001", "chapter_012", "page_001", 1, { type: "box", x: 118, y: 148, width: 280, height: 92 }, "Hunter Sung, the gate is unstable.", "Hunter Sung, the gate is unstable.", "Reviewed", "أيها الصياد سونغ، البوابة غير مستقرة.", "Approved", null, createdAt, updatedAt],
    ["text_002", "chapter_012", "page_001", 2, { type: "box", x: 424, y: 292, width: 246, height: 118 }, "If a Mana Crystal reacts like this, something is inside.", "If a Mana Crystal reacts like this, something is inside.", "Reviewed", "إذا تفاعلت بلورة المانا بهذا الشكل، فهناك شيء في الداخل.", "Needs Review", null, createdAt, updatedAt],
    ["text_003", "chapter_012", "page_001", 3, { type: "box", x: 156, y: 546, width: 330, height: 130 }, "The Shadow Monarch does not answer warnings.", "The Shadow Monarch does not answer warnings.", "Reviewed", "ملك الظلال لا يرد على التحذيرات.", "Needs Review", null, createdAt, updatedAt],
    ["text_004", "chapter_012", "page_002", 4, { type: "box", x: 382, y: 188, width: 312, height: 104 }, "Report this to the Hunter Association.", "Report this to the Hunter Association.", "Reviewed", "أبلغ جمعية الصيادين بهذا.", "Not Reviewed", null, createdAt, updatedAt],
    ["text_005", "chapter_012", "page_002", 5, { type: "box", x: 120, y: 764, width: 300, height: 112 }, "Shadow Exchange.", "Shadow Exchange.", "Reviewed", "تبادل الظل.", "Approved", null, createdAt, updatedAt],
  ];

  for (const row of textUnits) {
    const [id, chapterId, pageId, order, region, ocrText, finalText, sourceStatus, finalTranslation, reviewStatus, notes, created, updated] = row;
    insert(
      db,
      `INSERT INTO text_units (
        id, chapter_id, page_id, unit_order, region_json, source_ocr_text,
        source_final_text, source_status, final_translation, review_status,
        review_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        chapterId,
        pageId,
        order,
        JSON.stringify(region),
        ocrText,
        finalText,
        sourceStatus,
        finalTranslation,
        reviewStatus,
        notes,
        created,
        updated,
      ],
    );
  }

  const ocrRunId = "ocr_run_seed_001";
  insert(
    db,
    `INSERT INTO ocr_runs (
      id, chapter_id, provider, mode, language_hint, settings_json,
      started_at, completed_at, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ocrRunId,
      "chapter_012",
      "paddleocr",
      "page",
      "Korean",
      JSON.stringify({ preprocessing: ["grayscale", "contrast"] }),
      createdAt,
      updatedAt,
      "Completed",
      null,
    ],
  );

  for (const row of textUnits) {
    insert(
      db,
      `INSERT INTO ocr_candidates (
        id, ocr_run_id, text_unit_id, page_id, text, confidence, region_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `ocr_candidate_${row[0]}`,
        ocrRunId,
        row[0],
        row[2],
        row[5],
        0.91,
        JSON.stringify(row[4]),
        createdAt,
      ],
    );
  }

  const translationRuns = [
    ["translation_run_ai_seed", "chapter_012", "ai", "mock-contextual-model", JSON.stringify({ style: "Modern Standard Arabic" }), 1, 1, createdAt, updatedAt, "Completed", null],
    ["translation_run_ms_seed", "chapter_012", "microsoft", "microsoft-translator", JSON.stringify({}), 0, 0, createdAt, updatedAt, "Completed", null],
  ];

  for (const row of translationRuns) {
    insert(
      db,
      `INSERT INTO translation_runs (
        id, chapter_id, provider, model, settings_json, used_context,
        used_dictionary, started_at, completed_at, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row,
    );
  }

  const translations = [
    ["text_001", "أيها الصياد سونغ، البوابة غير مستقرة.", "الصياد سونغ، البوابة غير مستقرة."],
    ["text_002", "إذا تفاعلت بلورة المانا بهذا الشكل، فهناك شيء في الداخل.", "إذا تفاعل كريستال المانا هكذا، فهناك شيء بالداخل."],
    ["text_003", "ملك الظلال لا يجيب على التحذيرات.", "العاهل الظلي لا يرد على التحذيرات."],
    ["text_004", "أبلغ جمعية الصيادين بهذا.", "قم بإبلاغ جمعية الصيادين بهذا."],
    ["text_005", "تبادل الظل.", "تبادل الظلال."],
  ];

  for (const [textUnitId, aiText, msText] of translations) {
    insert(
      db,
      `INSERT INTO translation_candidates (
        id, translation_run_id, text_unit_id, provider, translated_text, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`candidate_ai_${textUnitId}`, "translation_run_ai_seed", textUnitId, "ai", aiText, null, updatedAt],
    );
    insert(
      db,
      `INSERT INTO translation_candidates (
        id, translation_run_id, text_unit_id, provider, translated_text, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`candidate_ms_${textUnitId}`, "translation_run_ms_seed", textUnitId, "microsoft", msText, null, updatedAt],
    );
  }

  const matches = [
    ["match_text_001_jinwoo", "text_001", "character_alias", "character_jinwoo", null, "Hunter Sung"],
    ["match_text_002_mana", "text_002", "term", null, "term_mana_crystal", "Mana Crystal"],
    ["match_text_003_shadow", "text_003", "term", null, "term_shadow_monarch", "Shadow Monarch"],
    ["match_text_004_assoc", "text_004", "term", null, "term_hunter_association", "Hunter Association"],
    ["match_text_005_exchange", "text_005", "term", null, "term_shadow_exchange", "Shadow Exchange"],
  ];

  for (const row of matches) {
    insert(
      db,
      `INSERT INTO dictionary_matches (
        id, text_unit_id, match_type, character_id, glossary_term_id, matched_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [...row, now()],
    );
  }
}

module.exports = {
  seedDatabase,
};
