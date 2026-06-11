function translationRunId() {
  return `translation_run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function translationCandidateId(runId, index) {
  return `translation_candidate_${runId}_${String(index + 1).padStart(4, "0")}`;
}

function normalizeLanguageCode(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const map = new Map([
    ["arabic", "ar"],
    ["العربية", "ar"],
    ["ar", "ar"],
    ["english", "en"],
    ["الانجليزية", "en"],
    ["الإنجليزية", "en"],
    ["en", "en"],
    ["korean", "ko"],
    ["ko", "ko"],
    ["japanese", "ja"],
    ["ja", "ja"],
    ["chinese", "zh-Hans"],
    ["zh", "zh-Hans"],
  ]);
  return map.get(normalized) ?? fallback;
}

function microsoftSettings(input = {}) {
  const key = process.env.FLORIS_MICROSOFT_TRANSLATOR_KEY || process.env.MICROSOFT_TRANSLATOR_KEY || "";
  const endpoint = (
    process.env.FLORIS_MICROSOFT_TRANSLATOR_ENDPOINT ||
    process.env.MICROSOFT_TRANSLATOR_ENDPOINT ||
    "https://api.cognitive.microsofttranslator.com"
  ).replace(/\/+$/, "");
  const region = process.env.FLORIS_MICROSOFT_TRANSLATOR_REGION || process.env.MICROSOFT_TRANSLATOR_REGION || "";
  return {
    endpoint,
    key,
    region,
    sourceLanguage: normalizeLanguageCode(input.sourceLanguage, ""),
    targetLanguage: normalizeLanguageCode(input.targetLanguage, "ar"),
  };
}

async function translateWithMicrosoft(texts, input = {}) {
  const settings = microsoftSettings(input);
  if (!settings.key) {
    throw new Error("Microsoft Translator is not configured. Set FLORIS_MICROSOFT_TRANSLATOR_KEY and region if required.");
  }

  const params = new URLSearchParams({
    "api-version": "3.0",
    to: settings.targetLanguage,
  });
  if (settings.sourceLanguage) params.set("from", settings.sourceLanguage);

  const headers = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": settings.key,
  };
  if (settings.region) headers["Ocp-Apim-Subscription-Region"] = settings.region;

  const response = await fetch(`${settings.endpoint}/translate?${params.toString()}`, {
    body: JSON.stringify(texts.map((text) => ({ text }))),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Microsoft Translator failed: ${response.status}${body ? ` ${body.slice(0, 180)}` : ""}`);
  }

  const payload = await response.json();
  return payload.map((item) => item?.translations?.[0]?.text ?? "");
}

class TranslationService {
  constructor(db) {
    this.db = db;
  }

  listTextUnits(input) {
    const scope = String(input?.scope ?? "text_unit");
    if (scope === "text_unit") {
      return this.db.prepare(`
        SELECT tu.*, p.source_language, p.target_language
        FROM text_units tu
        JOIN chapters c ON c.id = tu.chapter_id
        JOIN projects p ON p.id = c.project_id
        WHERE tu.id = ?
        ORDER BY tu.unit_order ASC
      `).all(String(input?.textUnitId ?? ""));
    }
    if (scope === "page") {
      return this.db.prepare(`
        SELECT tu.*, p.source_language, p.target_language
        FROM text_units tu
        JOIN chapters c ON c.id = tu.chapter_id
        JOIN projects p ON p.id = c.project_id
        WHERE tu.chapter_id = ? AND tu.page_id = ?
        ORDER BY tu.unit_order ASC
      `).all(String(input?.chapterId ?? ""), String(input?.pageId ?? ""));
    }
    return this.db.prepare(`
      SELECT tu.*, p.source_language, p.target_language
      FROM text_units tu
      JOIN chapters c ON c.id = tu.chapter_id
      JOIN projects p ON p.id = c.project_id
      WHERE tu.chapter_id = ?
      ORDER BY tu.unit_order ASC
    `).all(String(input?.chapterId ?? ""));
  }

  createRun(chapterId, input, timestamp) {
    const runId = translationRunId();
    this.db.prepare(`
      INSERT INTO translation_runs (
        id, chapter_id, provider, model, settings_json, used_context,
        used_dictionary, started_at, completed_at, status, error_message
      ) VALUES (?, ?, 'microsoft', 'microsoft-translator', ?, 0, 0, ?, NULL, 'running', NULL)
    `).run(
      runId,
      chapterId,
      JSON.stringify({
        scope: input.scope,
        pageId: input.pageId ?? null,
        textUnitId: input.textUnitId ?? null,
      }),
      timestamp,
    );
    return runId;
  }

  completeRun(runId, status, errorMessage = null) {
    this.db.prepare(`
      UPDATE translation_runs
      SET completed_at = ?,
          status = ?,
          error_message = ?
      WHERE id = ?
    `).run(new Date().toISOString(), status, errorMessage, runId);
  }

  async translateMicrosoft(input = {}) {
    const chapterId = String(input.chapterId ?? "");
    if (!chapterId) throw new Error("Chapter is required for translation.");
    const rows = this.listTextUnits(input)
      .map((row) => ({
        ...row,
        sourceText: String(row.source_final_text ?? row.source_ocr_text ?? "").trim(),
      }))
      .filter((row) => row.sourceText.length > 0);
    const timestamp = new Date().toISOString();
    const runId = this.createRun(chapterId, input, timestamp);

    if (rows.length === 0) {
      this.completeRun(runId, "completed");
      return {
        chapterId,
        failedCount: 0,
        provider: "microsoft",
        runId,
        status: "completed",
        translatedCount: 0,
      };
    }

    try {
      const sourceLanguage = input.sourceLanguage ?? rows[0]?.source_language;
      const targetLanguage = input.targetLanguage ?? rows[0]?.target_language;
      const translated = await translateWithMicrosoft(rows.map((row) => row.sourceText), {
        sourceLanguage,
        targetLanguage,
      });

      this.db.exec("BEGIN");
      try {
        translated.forEach((text, index) => {
          if (!text) return;
          this.db.prepare(`
            INSERT INTO translation_candidates (
              id, translation_run_id, text_unit_id, provider, translated_text,
              confidence, metadata_json, created_at
            ) VALUES (?, ?, ?, 'microsoft', ?, NULL, ?, ?)
          `).run(
            translationCandidateId(runId, index),
            runId,
            rows[index].id,
            text,
            JSON.stringify({
              sourceLanguage: normalizeLanguageCode(sourceLanguage, ""),
              targetLanguage: normalizeLanguageCode(targetLanguage, "ar"),
            }),
            timestamp,
          );
        });
        this.db.prepare(`
          UPDATE chapters
          SET internal_status = CASE WHEN ? > 0 THEN 'Draft Translated' ELSE internal_status END,
              updated_at = ?
          WHERE id = ?
        `).run(translated.filter(Boolean).length, timestamp, chapterId);
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

      this.completeRun(runId, "completed");
      return {
        chapterId,
        failedCount: translated.filter((text) => !text).length,
        provider: "microsoft",
        runId,
        status: "completed",
        translatedCount: translated.filter(Boolean).length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.completeRun(runId, "failed", message);
      throw error;
    }
  }
}

module.exports = {
  TranslationService,
};
