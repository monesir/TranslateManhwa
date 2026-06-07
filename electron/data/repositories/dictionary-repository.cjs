const {
  mapAliasRow,
  mapCharacterRow,
  mapGlossaryTermRow,
} = require("./mappers.cjs");

const GENDERS = new Set(["Male", "Female", "Unknown"]);

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function requiredString(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function optionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeGender(value) {
  const gender = String(value ?? "Unknown").trim();
  if (!GENDERS.has(gender)) {
    throw new Error("Gender must be Male, Female, or Unknown");
  }
  return gender;
}

function normalizeCategory(value) {
  return requiredString(value || "General Term", "Category");
}

function normalizeAliases(aliases = []) {
  if (!Array.isArray(aliases)) return [];

  return aliases
    .map((alias) => ({
      id: alias.id,
      english: String(alias.english ?? "").trim(),
      arabic: String(alias.arabic ?? "").trim(),
    }))
    .filter((alias) => alias.english || alias.arabic)
    .map((alias) => ({
      id: alias.id,
      english: requiredString(alias.english, "English alias"),
      arabic: requiredString(alias.arabic, "Arabic alias"),
    }));
}

class DictionaryRepository {
  constructor(db) {
    this.db = db;
  }

  getProjectDictionary(projectId) {
    const characterRows = this.db.prepare(`
      SELECT * FROM characters WHERE project_id = ? ORDER BY english_name COLLATE NOCASE ASC
    `).all(projectId);

    const aliasesByCharacter = new Map();
    const aliasRows = this.db.prepare(`
      SELECT ca.*
      FROM character_aliases ca
      JOIN characters c ON c.id = ca.character_id
      WHERE c.project_id = ?
      ORDER BY ca.english_alias COLLATE NOCASE ASC
    `).all(projectId);

    for (const alias of aliasRows) {
      const current = aliasesByCharacter.get(alias.character_id) ?? [];
      current.push(mapAliasRow(alias));
      aliasesByCharacter.set(alias.character_id, current);
    }

    const characters = characterRows.map((row) =>
      mapCharacterRow(row, aliasesByCharacter.get(row.id) ?? []),
    );

    const glossaryTerms = this.db.prepare(`
      SELECT * FROM glossary_terms
      WHERE project_id = ?
      ORDER BY category COLLATE NOCASE ASC, english_term COLLATE NOCASE ASC
    `).all(projectId).map(mapGlossaryTermRow);

    return {
      characters,
      glossaryTerms,
      categories: this.listCategories(projectId),
    };
  }

  listCategories(projectId) {
    const rows = this.db.prepare(`
      SELECT DISTINCT category
      FROM glossary_terms
      WHERE project_id = ? AND TRIM(category) <> ''
      ORDER BY category COLLATE NOCASE ASC
    `).all(projectId);

    return rows.map((row) => row.category);
  }

  addCharacter(projectId, input) {
    const timestamp = new Date().toISOString();
    const id = makeId("character");
    const character = this.normalizeCharacterInput(input);
    this.ensureUniqueCharacterName(projectId, character.englishName);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO characters (
          id, project_id, english_name, arabic_name, gender, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        projectId,
        character.englishName,
        character.arabicName,
        character.gender,
        character.description,
        timestamp,
        timestamp,
      );

      this.replaceCharacterAliases(id, character.aliases, timestamp);
      this.touchProject(projectId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getCharacterById(id);
  }

  updateCharacter(characterId, input) {
    const existing = this.getCharacterRow(characterId);
    const timestamp = new Date().toISOString();
    const character = this.normalizeCharacterInput(input);
    this.ensureUniqueCharacterName(existing.project_id, character.englishName, characterId);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        UPDATE characters
        SET english_name = ?, arabic_name = ?, gender = ?, description = ?, updated_at = ?
        WHERE id = ?
      `).run(
        character.englishName,
        character.arabicName,
        character.gender,
        character.description,
        timestamp,
        characterId,
      );

      this.replaceCharacterAliases(characterId, character.aliases, timestamp);
      this.touchProject(existing.project_id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getCharacterById(characterId);
  }

  deleteCharacter(characterId) {
    const existing = this.getCharacterRow(characterId);
    const timestamp = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM characters WHERE id = ?").run(characterId);
      this.touchProject(existing.project_id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return { id: characterId };
  }

  addCharacterAlias(characterId, input) {
    const existing = this.getCharacterRow(characterId);
    const alias = normalizeAliases([input])[0];
    const id = makeId("alias");
    const timestamp = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO character_aliases (
          id, character_id, english_alias, arabic_alias, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, characterId, alias.english, alias.arabic, timestamp, timestamp);
      this.touchProject(existing.project_id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return mapAliasRow({
      id,
      english_alias: alias.english,
      arabic_alias: alias.arabic,
    });
  }

  addGlossaryTerm(projectId, input) {
    const timestamp = new Date().toISOString();
    const id = makeId("term");
    const term = this.normalizeTermInput(input);
    this.ensureUniqueTerm(projectId, term.englishTerm);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO glossary_terms (
          id, project_id, category, english_term, arabic_term, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        projectId,
        term.category,
        term.englishTerm,
        term.arabicTerm,
        term.description,
        timestamp,
        timestamp,
      );
      this.touchProject(projectId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getGlossaryTermById(id);
  }

  updateGlossaryTerm(termId, input) {
    const existing = this.getGlossaryTermRow(termId);
    const timestamp = new Date().toISOString();
    const term = this.normalizeTermInput(input);
    this.ensureUniqueTerm(existing.project_id, term.englishTerm, termId);

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        UPDATE glossary_terms
        SET category = ?, english_term = ?, arabic_term = ?, description = ?, updated_at = ?
        WHERE id = ?
      `).run(
        term.category,
        term.englishTerm,
        term.arabicTerm,
        term.description,
        timestamp,
        termId,
      );
      this.touchProject(existing.project_id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getGlossaryTermById(termId);
  }

  deleteGlossaryTerm(termId) {
    const existing = this.getGlossaryTermRow(termId);
    const timestamp = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM glossary_terms WHERE id = ?").run(termId);
      this.touchProject(existing.project_id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return { id: termId };
  }

  normalizeCharacterInput(input) {
    return {
      englishName: requiredString(input?.englishName, "English name"),
      arabicName: requiredString(input?.arabicName, "Arabic name"),
      gender: normalizeGender(input?.gender),
      aliases: normalizeAliases(input?.aliases),
      description: optionalString(input?.description),
    };
  }

  normalizeTermInput(input) {
    return {
      englishTerm: requiredString(input?.englishTerm, "English term"),
      arabicTerm: requiredString(input?.arabicTerm, "Arabic term"),
      category: normalizeCategory(input?.category),
      description: optionalString(input?.description),
    };
  }

  replaceCharacterAliases(characterId, aliases, timestamp) {
    this.db.prepare("DELETE FROM character_aliases WHERE character_id = ?").run(characterId);

    for (const alias of aliases) {
      this.db.prepare(`
        INSERT INTO character_aliases (
          id, character_id, english_alias, arabic_alias, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        alias.id ?? makeId("alias"),
        characterId,
        alias.english,
        alias.arabic,
        timestamp,
        timestamp,
      );
    }
  }

  ensureUniqueCharacterName(projectId, englishName, excludingId = null) {
    const row = this.db.prepare(`
      SELECT id FROM characters
      WHERE project_id = ? AND english_name = ? COLLATE NOCASE
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `).get(projectId, englishName, excludingId, excludingId);

    if (row) {
      throw new Error(`Character already exists: ${englishName}`);
    }
  }

  ensureUniqueTerm(projectId, englishTerm, excludingId = null) {
    const row = this.db.prepare(`
      SELECT id FROM glossary_terms
      WHERE project_id = ? AND english_term = ? COLLATE NOCASE
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `).get(projectId, englishTerm, excludingId, excludingId);

    if (row) {
      throw new Error(`Glossary term already exists: ${englishTerm}`);
    }
  }

  getCharacterRow(characterId) {
    const row = this.db.prepare("SELECT * FROM characters WHERE id = ?").get(characterId);
    if (!row) throw new Error(`Character not found: ${characterId}`);
    return row;
  }

  getCharacterById(characterId) {
    const row = this.getCharacterRow(characterId);
    const aliases = this.db.prepare(`
      SELECT * FROM character_aliases
      WHERE character_id = ?
      ORDER BY english_alias COLLATE NOCASE ASC
    `).all(characterId).map(mapAliasRow);

    return mapCharacterRow(row, aliases);
  }

  getGlossaryTermRow(termId) {
    const row = this.db.prepare("SELECT * FROM glossary_terms WHERE id = ?").get(termId);
    if (!row) throw new Error(`Glossary term not found: ${termId}`);
    return row;
  }

  getGlossaryTermById(termId) {
    return mapGlossaryTermRow(this.getGlossaryTermRow(termId));
  }

  touchProject(projectId, timestamp) {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, projectId);
  }
}

module.exports = {
  DictionaryRepository,
};
