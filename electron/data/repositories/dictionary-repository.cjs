const {
  mapAliasRow,
  mapCategoryRow,
  mapCharacterRow,
  mapGlossaryTermRow,
} = require("./mappers.cjs");

class DictionaryRepository {
  constructor(db) {
    this.db = db;
  }

  getProjectDictionary(projectId) {
    const characterRows = this.db.prepare(`
      SELECT * FROM characters WHERE project_id = ? ORDER BY english_name ASC
    `).all(projectId);

    const aliasesByCharacter = new Map();
    const aliasRows = this.db.prepare(`
      SELECT ca.*
      FROM character_aliases ca
      JOIN characters c ON c.id = ca.character_id
      WHERE c.project_id = ?
      ORDER BY ca.english_alias ASC
    `).all(projectId);

    for (const alias of aliasRows) {
      const current = aliasesByCharacter.get(alias.character_id) ?? [];
      current.push(mapAliasRow(alias));
      aliasesByCharacter.set(alias.character_id, current);
    }

    const characters = characterRows.map((row) =>
      mapCharacterRow(row, aliasesByCharacter.get(row.id) ?? []),
    );

    const categories = this.db.prepare(`
      SELECT * FROM glossary_categories WHERE project_id = ? ORDER BY name ASC
    `).all(projectId).map(mapCategoryRow);

    const glossaryTerms = this.db.prepare(`
      SELECT gt.*, gc.name AS category_name
      FROM glossary_terms gt
      LEFT JOIN glossary_categories gc ON gc.id = gt.category_id
      WHERE gt.project_id = ?
      ORDER BY gt.english_term ASC
    `).all(projectId).map(mapGlossaryTermRow);

    return {
      characters,
      glossaryTerms,
      categories,
    };
  }

  addGlossaryCategory(projectId, name) {
    const id = `cat_${Date.now()}`;
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO glossary_categories (id, project_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, name, timestamp, timestamp);

    return mapCategoryRow({ id, project_id: projectId, name });
  }

  addCharacter(projectId, input) {
    const timestamp = new Date().toISOString();
    const id = `character_${Date.now()}`;

    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        INSERT INTO characters (
          id, project_id, english_name, arabic_name, gender, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        projectId,
        input.englishName,
        input.arabicName,
        input.gender,
        input.description ?? null,
        timestamp,
        timestamp,
      );

      for (const alias of input.aliases ?? []) {
        this.db.prepare(`
          INSERT INTO character_aliases (
            id, character_id, english_alias, arabic_alias, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          alias.id ?? `alias_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          id,
          alias.english,
          alias.arabic,
          timestamp,
          timestamp,
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return mapCharacterRow(
      {
        id,
        project_id: projectId,
        english_name: input.englishName,
        arabic_name: input.arabicName,
        gender: input.gender,
        description: input.description ?? null,
      },
      input.aliases ?? [],
    );
  }

  addCharacterAlias(characterId, input) {
    const id = `alias_${Date.now()}`;
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO character_aliases (
        id, character_id, english_alias, arabic_alias, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, characterId, input.english, input.arabic, timestamp, timestamp);

    return mapAliasRow({
      id,
      english_alias: input.english,
      arabic_alias: input.arabic,
    });
  }

  addGlossaryTerm(projectId, input) {
    const id = `term_${Date.now()}`;
    const timestamp = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO glossary_terms (
        id, project_id, category_id, english_term, arabic_term, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.categoryId,
      input.englishTerm,
      input.arabicTerm,
      input.description ?? null,
      timestamp,
      timestamp,
    );

    const row = this.db.prepare(`
      SELECT gt.*, gc.name AS category_name
      FROM glossary_terms gt
      LEFT JOIN glossary_categories gc ON gc.id = gt.category_id
      WHERE gt.id = ?
    `).get(id);

    return mapGlossaryTermRow(row);
  }
}

module.exports = {
  DictionaryRepository,
};
