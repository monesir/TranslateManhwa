const MIGRATIONS = [
  {
    version: 1,
    name: "initial_schema",
    up(db) {
      db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          arabic_title TEXT,
          original_title TEXT,
          source_language TEXT NOT NULL,
          target_language TEXT NOT NULL DEFAULT 'Arabic',
          cover_asset_id TEXT,
          status TEXT NOT NULL DEFAULT 'Active'
            CHECK (status IN ('Active', 'Paused', 'Completed', 'Archived')),
          last_worked_chapter_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_metadata (
          project_id TEXT PRIMARY KEY,
          author TEXT,
          artist TEXT,
          description TEXT,
          genres_json TEXT,
          external_status TEXT,
          start_year INTEGER,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_sources (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          source_key TEXT,
          external_id TEXT,
          url TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS project_contexts (
          project_id TEXT PRIMARY KEY,
          markdown TEXT NOT NULL DEFAULT '',
          summary TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          kind TEXT NOT NULL,
          path TEXT NOT NULL,
          mime_type TEXT,
          width INTEGER,
          height INTEGER,
          size_bytes INTEGER,
          checksum TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          number TEXT NOT NULL,
          title TEXT,
          display_label TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Not Started'
            CHECK (status IN ('Not Started', 'In Progress', 'Completed')),
          internal_status TEXT NOT NULL DEFAULT 'Images Ready'
            CHECK (internal_status IN (
              'Images Ready',
              'OCR Done',
              'Draft Translated',
              'Human Edited',
              'Reviewed',
              'Typeset',
              'Completed'
            )),
          sort_order INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          page_index INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS text_units (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          page_id TEXT NOT NULL,
          unit_order INTEGER NOT NULL,
          region_json TEXT,
          source_ocr_text TEXT,
          source_final_text TEXT,
          source_status TEXT NOT NULL DEFAULT 'Empty'
            CHECK (source_status IN ('Empty', 'OCR Ready', 'Needs Review', 'Reviewed', 'Ignored')),
          final_translation TEXT,
          review_status TEXT NOT NULL DEFAULT 'Not Reviewed'
            CHECK (review_status IN ('Not Reviewed', 'Needs Review', 'Approved')),
          review_notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ocr_runs (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          mode TEXT NOT NULL,
          language_hint TEXT,
          settings_json TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ocr_candidates (
          id TEXT PRIMARY KEY,
          ocr_run_id TEXT NOT NULL,
          text_unit_id TEXT,
          page_id TEXT NOT NULL,
          text TEXT NOT NULL,
          confidence REAL,
          region_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (ocr_run_id) REFERENCES ocr_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE SET NULL,
          FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS translation_runs (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT,
          settings_json TEXT,
          used_context INTEGER NOT NULL DEFAULT 0,
          used_dictionary INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS translation_candidates (
          id TEXT PRIMARY KEY,
          translation_run_id TEXT NOT NULL,
          text_unit_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          translated_text TEXT NOT NULL,
          confidence REAL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (translation_run_id) REFERENCES translation_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          english_name TEXT NOT NULL,
          arabic_name TEXT NOT NULL,
          gender TEXT NOT NULL DEFAULT 'Unknown'
            CHECK (gender IN ('Male', 'Female', 'Unknown')),
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS character_aliases (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          english_alias TEXT NOT NULL,
          arabic_alias TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS glossary_terms (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'General Term',
          english_term TEXT NOT NULL,
          arabic_term TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS dictionary_matches (
          id TEXT PRIMARY KEY,
          text_unit_id TEXT NOT NULL,
          match_type TEXT NOT NULL CHECK (match_type IN ('character', 'character_alias', 'term')),
          character_id TEXT,
          glossary_term_id TEXT,
          matched_text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY (glossary_term_id) REFERENCES glossary_terms(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS typesetting_items (
          id TEXT PRIMARY KEY,
          text_unit_id TEXT NOT NULL,
          font_family TEXT,
          font_size REAL,
          font_weight TEXT,
          align TEXT,
          box_json TEXT,
          style_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (text_unit_id) REFERENCES text_units(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT,
          kind TEXT NOT NULL,
          output_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS app_events (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          chapter_id TEXT,
          event_type TEXT NOT NULL,
          payload_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projects_updated_at
          ON projects(updated_at);
        CREATE INDEX IF NOT EXISTS idx_chapters_project_sort
          ON chapters(project_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_chapters_project_status
          ON chapters(project_id, status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_chapter_index
          ON pages(chapter_id, page_index);
        CREATE INDEX IF NOT EXISTS idx_text_units_chapter_order
          ON text_units(chapter_id, unit_order);
        CREATE INDEX IF NOT EXISTS idx_text_units_page_order
          ON text_units(page_id, unit_order);
        CREATE INDEX IF NOT EXISTS idx_text_units_review
          ON text_units(chapter_id, review_status);
        CREATE INDEX IF NOT EXISTS idx_translation_candidates_text_unit
          ON translation_candidates(text_unit_id);
        CREATE INDEX IF NOT EXISTS idx_ocr_candidates_text_unit
          ON ocr_candidates(text_unit_id);
        CREATE INDEX IF NOT EXISTS idx_characters_project
          ON characters(project_id);
        CREATE INDEX IF NOT EXISTS idx_character_aliases_character
          ON character_aliases(character_id);
        CREATE INDEX IF NOT EXISTS idx_glossary_terms_project
          ON glossary_terms(project_id);
        CREATE INDEX IF NOT EXISTS idx_glossary_terms_category
          ON glossary_terms(project_id, category);
      `);
    },
  },
  {
    version: 2,
    name: "glossary_category_value",
    up(db) {
      const columns = db.prepare("PRAGMA table_info(glossary_terms)").all();
      const hasCategory = columns.some((column) => column.name === "category");

      if (!hasCategory) {
        db.exec(`
          ALTER TABLE glossary_terms
          ADD COLUMN category TEXT NOT NULL DEFAULT 'General Term';
        `);
      }

      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'glossary_categories'
      `).all();

      if (tables.length > 0) {
        db.exec(`
          UPDATE glossary_terms
          SET category = COALESCE(
            (
              SELECT gc.name
              FROM glossary_categories gc
              WHERE gc.id = glossary_terms.category_id
            ),
            NULLIF(category, ''),
            'General Term'
          );
        `);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_glossary_terms_project_category
          ON glossary_terms(project_id, category);
      `);
    },
  },
];

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function runMigrations(db) {
  ensureMigrationTable(db);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

module.exports = {
  runMigrations,
};
