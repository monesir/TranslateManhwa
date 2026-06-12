const fs = require("node:fs");
const path = require("node:path");

const AI_TRANSLATION_BATCH_SIZE = 20;
const AI_TRANSLATION_MAX_BATCH_SIZE = 60;
const AI_REQUEST_VERSION = "1.0";
const DEFAULT_AI_PROVIDER_ID = "openai_compatible";
const DEFAULT_AI_TRANSLATION_MODEL = "gpt-4o-mini";
const AGENT_FILE_ORDER = [
  "AGENTS.md",
  "translator-system.md",
  "arabic-style-guide.md",
  "ocr-error-correction.md",
  "translation-levels.md",
  "quality-rubric.md",
  "context-contract.md",
];

function aiTranslationRunId() {
  return `translation_run_ai_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function aiTranslationCandidateId(runId, index) {
  return `translation_candidate_${runId}_${String(index + 1).padStart(4, "0")}`;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function optionalString(value) {
  const text = normalizeString(value);
  return text || null;
}

function normalizeLanguageCode(value, fallback) {
  const normalized = normalizeString(value).toLowerCase();
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

function looksCjkText(text) {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text);
}

function normalizeSourceText(value, sourceLanguage = "") {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return "";

  const language = normalizeLanguageCode(sourceLanguage, "");
  const joiner = language === "ja" || language === "ko" || language.startsWith("zh") || looksCjkText(text)
    ? ""
    : " ";

  return text
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(joiner)
      .replace(/[ \t]{2,}/g, " ")
      .trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeTranslationLevel(value) {
  const numeric = Math.round(Number(value ?? 3));
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(1, Math.min(5, numeric));
}

function normalizeMode(value) {
  const mode = normalizeString(value);
  return ["draft", "revise", "final"].includes(mode) ? mode : "draft";
}

function normalizeScope(value) {
  const scope = normalizeString(value);
  return ["text_unit", "page", "chapter"].includes(scope) ? scope : "text_unit";
}

function normalizeBatchSize(value) {
  const numeric = Math.round(Number(value ?? AI_TRANSLATION_BATCH_SIZE));
  if (!Number.isFinite(numeric)) return AI_TRANSLATION_BATCH_SIZE;
  return Math.max(1, Math.min(AI_TRANSLATION_MAX_BATCH_SIZE, numeric));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function textContains(text, phrase) {
  const source = normalizeString(text).toLowerCase();
  const needle = normalizeString(phrase).toLowerCase();
  return Boolean(source && needle && source.includes(needle));
}

function readAgentInstructions() {
  const agentDir = path.resolve(__dirname, "..", "..", "agent");
  return AGENT_FILE_ORDER.map((fileName) => {
    const filePath = path.join(agentDir, fileName);
    const content = fs.readFileSync(filePath, "utf8").trim();
    return `# ${fileName}\n\n${content}`;
  }).join("\n\n---\n\n");
}

function defaultAiProviderConfigPath(workspacePath) {
  const root = workspacePath || path.resolve(__dirname, "..", "..", ".workspace");
  return path.join(root, "secrets", "ai-providers.json");
}

function readAiProviderConfig(configPath) {
  const targetPath = configPath || defaultAiProviderConfigPath();
  if (!fs.existsSync(targetPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AI provider config is invalid: ${targetPath}: ${message}`);
  }
}

function normalizeProvidersConfig(providers) {
  if (!providers || typeof providers !== "object") return [];
  if (Array.isArray(providers)) {
    return providers
      .map((provider) => provider && typeof provider === "object" ? provider : null)
      .filter(Boolean);
  }
  return Object.entries(providers)
    .map(([id, provider]) => provider && typeof provider === "object" ? { id, ...provider } : null)
    .filter(Boolean);
}

function normalizeProviderKey(key, index) {
  if (typeof key === "string") {
    const value = normalizeString(key);
    return value ? { id: `key_${index + 1}`, value } : null;
  }
  if (!key || typeof key !== "object" || key.enabled === false) return null;
  const value = normalizeString(key.value || key.key || key.apiKey);
  if (!value) return null;
  return {
    id: normalizeString(key.id || key.name || `key_${index + 1}`),
    value,
  };
}

function normalizeProviderKeys(provider = {}) {
  const rawKeys = Array.isArray(provider.keys)
    ? provider.keys
    : provider.apiKey || provider.key
      ? [{ id: "default", value: provider.apiKey || provider.key }]
      : [];
  const keys = rawKeys.map(normalizeProviderKey).filter(Boolean);
  const activeKeyId = normalizeString(provider.activeKeyId || provider.activeKey);
  if (!activeKeyId) return keys;
  const active = keys.find((key) => key.id === activeKeyId);
  if (!active) return keys;
  return [
    active,
    ...keys.filter((key) => key.id !== activeKeyId),
  ];
}

function normalizeHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [normalizeString(key), normalizeString(headerValue)])
      .filter(([key, headerValue]) => key && headerValue),
  );
}

function maskKey(value) {
  const key = normalizeString(value);
  if (!key) return "";
  if (key.length <= 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function responseFormatEnabledFromConfig(provider) {
  const envValue = normalizeString(process.env.FLORIS_AI_TRANSLATION_RESPONSE_FORMAT).toLowerCase();
  if (["0", "false", "off"].includes(envValue)) return false;
  if (["1", "true", "on"].includes(envValue)) return true;
  if (provider && Object.prototype.hasOwnProperty.call(provider, "responseFormat")) {
    return provider.responseFormat !== false;
  }
  return true;
}

function normalizeBooleanConfig(value, fallback = null) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function normalizeReasoningEffort(value) {
  const effort = normalizeString(value).toLowerCase();
  return ["xhigh", "high", "medium", "low", "minimal", "none"].includes(effort) ? effort : "";
}

function normalizeReasoningConfig(provider = {}) {
  const envEffort = normalizeReasoningEffort(process.env.FLORIS_AI_TRANSLATION_REASONING_EFFORT);
  const envExclude = normalizeBooleanConfig(process.env.FLORIS_AI_TRANSLATION_REASONING_EXCLUDE, null);
  const providerReasoning = provider && typeof provider.reasoning === "object" && !Array.isArray(provider.reasoning)
    ? provider.reasoning
    : null;
  const effort = envEffort ||
    normalizeReasoningEffort(providerReasoning?.effort) ||
    normalizeReasoningEffort(provider.reasoningEffort || provider.reasoning_effort);
  const exclude = envExclude ?? normalizeBooleanConfig(providerReasoning?.exclude, null);
  const enabled = normalizeBooleanConfig(providerReasoning?.enabled, null);
  const maxTokens = Number(providerReasoning?.max_tokens ?? providerReasoning?.maxTokens);
  const reasoning = {};

  if (effort) reasoning.effort = effort;
  if (Number.isFinite(maxTokens) && maxTokens > 0) reasoning.max_tokens = Math.round(maxTokens);
  if (exclude !== null) reasoning.exclude = exclude;
  if (enabled !== null) reasoning.enabled = enabled;

  return Object.keys(reasoning).length > 0 ? reasoning : null;
}

function resolveConfiguredProvider(input = {}, config = null) {
  const providers = normalizeProvidersConfig(config?.providers);
  if (!providers.length) return null;
  const requestedId = normalizeString(
    input.aiProvider || config?.activeProvider || process.env.FLORIS_AI_TRANSLATION_PROVIDER,
  );
  if (requestedId) {
    return providers.find((provider) => normalizeString(provider.id) === requestedId) ?? null;
  }
  return providers[0] ?? null;
}

function aiProviderSettings(input = {}, options = {}) {
  let config = null;
  let configError = null;
  try {
    config = readAiProviderConfig(options.configPath);
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  const configuredProvider = configError ? null : resolveConfiguredProvider(input, config);
  if (configuredProvider) {
    const apiKeys = normalizeProviderKeys(configuredProvider);
    const providerId = normalizeString(
      configuredProvider.id || input.aiProvider || config?.activeProvider || DEFAULT_AI_PROVIDER_ID,
    );
    const providerType = normalizeString(configuredProvider.type || "openai_compatible");
    const model = normalizeString(
      input.model ||
      process.env.FLORIS_AI_TRANSLATION_MODEL ||
      configuredProvider.model ||
      process.env.OPENAI_MODEL ||
      DEFAULT_AI_TRANSLATION_MODEL,
    );
    return {
      apiKey: apiKeys[0]?.value ?? "",
      apiKeys,
      baseUrl: normalizeString(
        process.env.FLORIS_AI_TRANSLATION_BASE_URL ||
        configuredProvider.baseUrl ||
        process.env.OPENAI_BASE_URL ||
        "https://api.openai.com/v1",
      ).replace(/\/+$/, ""),
      configPath: options.configPath,
      headers: normalizeHeaders(configuredProvider.headers),
      label: normalizeString(configuredProvider.label || providerId),
      maxTokens: Number(configuredProvider.maxTokens ?? process.env.FLORIS_AI_TRANSLATION_MAX_TOKENS ?? 4096),
      model,
      providerId,
      providerType,
      reasoning: normalizeReasoningConfig(configuredProvider),
      responseFormat: responseFormatEnabledFromConfig(configuredProvider),
      temperature: Number(configuredProvider.temperature ?? process.env.FLORIS_AI_TRANSLATION_TEMPERATURE ?? 0.2),
    };
  }

  const providerId = normalizeString(input.aiProvider || process.env.FLORIS_AI_TRANSLATION_PROVIDER || DEFAULT_AI_PROVIDER_ID);
  const apiKey = normalizeString(
    process.env.FLORIS_AI_TRANSLATION_API_KEY ||
    process.env.OPENAI_API_KEY,
  );
  const baseUrl = normalizeString(
    process.env.FLORIS_AI_TRANSLATION_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1",
  ).replace(/\/+$/, "");
  const model = normalizeString(
    input.model ||
    process.env.FLORIS_AI_TRANSLATION_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_AI_TRANSLATION_MODEL,
  );
  return {
    apiKey,
    apiKeys: apiKey ? [{ id: "env", value: apiKey }] : [],
    baseUrl,
    configError,
    configPath: options.configPath,
    headers: {},
    label: "OpenAI-compatible chat completions",
    maxTokens: Number(process.env.FLORIS_AI_TRANSLATION_MAX_TOKENS ?? 4096),
    model,
    providerId,
    providerType: "openai_compatible",
    reasoning: normalizeReasoningConfig({}),
    responseFormat: responseFormatEnabledFromConfig(null),
    temperature: Number(process.env.FLORIS_AI_TRANSLATION_TEMPERATURE ?? 0.2),
  };
}

function providerStatus(settings) {
  if (settings.configError) {
    return {
      activeKeyId: null,
      available: false,
      id: settings.providerId || DEFAULT_AI_PROVIDER_ID,
      keyCount: 0,
      label: settings.label || settings.providerId || DEFAULT_AI_PROVIDER_ID,
      model: settings.model || DEFAULT_AI_TRANSLATION_MODEL,
      reason: settings.configError,
      requires: "Fix the local AI provider config JSON.",
    };
  }
  if (settings.providerType !== "openai_compatible") {
    return {
      activeKeyId: null,
      available: false,
      id: settings.providerId,
      keyCount: settings.apiKeys?.length ?? 0,
      label: settings.label || settings.providerId,
      model: settings.model,
      reason: `Unsupported AI translation provider type: ${settings.providerType}`,
      requires: "Use provider type openai_compatible.",
    };
  }
  if (!settings.apiKeys?.length) {
    return {
      activeKeyId: null,
      available: false,
      id: settings.providerId,
      keyCount: 0,
      label: settings.label || settings.providerId,
      model: settings.model,
      reason: "AI translation API key is not configured.",
      requires: "Set a key in .workspace/secrets/ai-providers.json or use FLORIS_AI_TRANSLATION_API_KEY.",
    };
  }
  return {
    activeKeyId: settings.apiKeys[0]?.id ?? null,
    available: true,
    id: settings.providerId,
    keyCount: settings.apiKeys.length,
    label: settings.label || settings.providerId,
    model: settings.model,
    reason: null,
    requires: null,
  };
}

function extractJsonPayload(content) {
  const text = normalizeString(content)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("AI provider returned non-JSON content.");
  }
}

function normalizeWarnings(value, textUnitId = null) {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => ({
      code: normalizeString(warning?.code || "warning"),
      message: normalizeString(warning?.message),
      textUnitId: warning?.textUnitId == null ? textUnitId : normalizeString(warning.textUnitId),
    }))
    .filter((warning) => warning.code && warning.message);
}

function normalizeUsedTerms(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((term) => ({
      arabic: normalizeString(term?.arabic),
      source: normalizeString(term?.source),
      type: ["character", "term", "alias", "inferred"].includes(term?.type) ? term.type : "inferred",
    }))
    .filter((term) => term.source && term.arabic);
}

function normalizeFit(value) {
  const risk = ["low", "medium", "high"].includes(value?.risk) ? value.risk : "medium";
  return {
    reason: optionalString(value?.reason),
    risk,
  };
}

function normalizeAiResponse(payload, expectedTextUnitIds, translationLevel) {
  const expected = new Set(expectedTextUnitIds);
  const translations = (Array.isArray(payload?.translations) ? payload.translations : [])
    .map((item) => {
      const textUnitId = normalizeString(item?.textUnitId);
      const arabicText = normalizeString(item?.arabicText);
      if (!expected.has(textUnitId) || !arabicText) return null;
      return {
        arabicText,
        confidence: clampConfidence(item?.confidence),
        fit: normalizeFit(item?.fit),
        notes: Array.isArray(item?.notes) ? item.notes.map(normalizeString).filter(Boolean) : [],
        sourceText: normalizeString(item?.sourceText),
        styleLevel: item?.styleLevel == null ? translationLevel : normalizeTranslationLevel(item.styleLevel),
        textUnitId,
        usedTerms: normalizeUsedTerms(item?.usedTerms),
        warnings: normalizeWarnings(item?.warnings, textUnitId),
      };
    })
    .filter(Boolean);

  const glossarySuggestions = (Array.isArray(payload?.glossarySuggestions) ? payload.glossarySuggestions : [])
    .map((item) => ({
      arabic: normalizeString(item?.arabic),
      category: optionalString(item?.category),
      gender: ["Male", "Female", "Unknown"].includes(item?.gender) ? item.gender : null,
      kind: ["character", "term"].includes(item?.kind) ? item.kind : "term",
      reason: normalizeString(item?.reason),
      source: normalizeString(item?.source),
    }))
    .filter((item) => item.source && item.arabic && item.reason);

  return {
    glossarySuggestions,
    runWarnings: normalizeWarnings(payload?.runWarnings),
    translations,
    version: AI_REQUEST_VERSION,
  };
}

async function callOpenAiCompatibleProvider(request, settings, agentInstructions) {
  const status = providerStatus(settings);
  if (!status.available) {
    throw new Error(status.reason);
  }

  const body = {
    messages: [
      {
        content: [
          "You are executing the FlorisMNHar AI translation contract.",
          "Follow the agent instructions exactly.",
          "Return JSON only.",
          "",
          agentInstructions,
        ].join("\n"),
        role: "system",
      },
      {
        content: JSON.stringify(request),
        role: "user",
      },
    ],
    model: settings.model,
    temperature: Number.isFinite(settings.temperature) ? settings.temperature : 0.2,
  };
  if (Number.isFinite(settings.maxTokens) && settings.maxTokens > 0) {
    body.max_tokens = Math.round(settings.maxTokens);
  }
  if (settings.reasoning) {
    body.reasoning = settings.reasoning;
    if (settings.reasoning.effort) body.reasoning_effort = settings.reasoning.effort;
  }
  if (settings.responseFormat !== false) {
    body.response_format = { type: "json_object" };
  }

  let lastError = null;
  for (const [index, key] of settings.apiKeys.entries()) {
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      body: JSON.stringify(body),
      headers: {
        ...settings.headers,
        Authorization: `Bearer ${key.value}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (response.ok) {
      const payload = await response.json();
      const choice = payload?.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      if (!content) {
        const reasoningLength = normalizeString(message?.reasoning).length;
        const suffix = choice?.finish_reason
          ? ` finish_reason=${choice.finish_reason}${reasoningLength ? ` reasoning_chars=${reasoningLength}` : ""}`
          : "";
        throw new Error(`AI provider response did not include message content.${suffix}`);
      }
      try {
        return extractJsonPayload(content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const suffix = choice?.finish_reason ? ` finish_reason=${choice.finish_reason}` : "";
        throw new Error(`${message}${suffix}`);
      }
    }

    const responseBody = await response.text().catch(() => "");
    const keyLabel = key.id || maskKey(key.value);
    lastError = `AI translation provider failed with key ${keyLabel}: ${response.status}${responseBody ? ` ${responseBody.slice(0, 300)}` : ""}`;
    const canTryNextKey = index < settings.apiKeys.length - 1 && [401, 403, 429].includes(response.status);
    if (!canTryNextKey) break;
  }

  throw new Error(lastError || "AI translation provider failed.");
}

function isRecoverableAiBatchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /non-JSON content|did not include message content|finish_reason=length|Unexpected end of JSON|unterminated string/i
    .test(message);
}

class AiTranslationService {
  constructor(db, options = {}) {
    this.db = db;
    this.agentInstructions = null;
    this.configPath = options.configPath || defaultAiProviderConfigPath(options.workspacePath);
  }

  listProviders(input = {}) {
    return [providerStatus(aiProviderSettings(input, { configPath: this.configPath }))];
  }

  getAgentInstructions() {
    if (!this.agentInstructions) {
      this.agentInstructions = readAgentInstructions();
    }
    return this.agentInstructions;
  }

  getChapterContext(chapterId) {
    const row = this.db.prepare(`
      SELECT
        c.*,
        p.title AS project_title,
        p.arabic_title,
        p.original_title,
        p.source_language,
        p.target_language,
        pc.markdown AS context_markdown,
        pc.summary AS context_summary,
        pm.description AS project_description,
        pm.genres_json
      FROM chapters c
      JOIN projects p ON p.id = c.project_id
      LEFT JOIN project_contexts pc ON pc.project_id = p.id
      LEFT JOIN project_metadata pm ON pm.project_id = p.id
      WHERE c.id = ?
    `).get(chapterId);
    if (!row) throw new Error(`Chapter not found: ${chapterId}`);
    return row;
  }

  listTextRows(input, chapter) {
    const scope = normalizeScope(input.scope);
    const select = `
      SELECT
        tu.*,
        p.page_index,
        p.width AS page_width,
        p.height AS page_height,
        (
          SELECT tc.translated_text
          FROM translation_candidates tc
          WHERE tc.text_unit_id = tu.id AND tc.provider = 'microsoft'
          ORDER BY tc.created_at DESC
          LIMIT 1
        ) AS microsoft_translation,
        (
          SELECT tc.translated_text
          FROM translation_candidates tc
          WHERE tc.text_unit_id = tu.id AND tc.provider = 'ai'
          ORDER BY tc.created_at DESC
          LIMIT 1
        ) AS ai_translation,
        (
          SELECT oc.confidence
          FROM ocr_candidates oc
          WHERE oc.text_unit_id = tu.id
          ORDER BY oc.created_at DESC
          LIMIT 1
        ) AS ocr_confidence
      FROM text_units tu
      JOIN pages p ON p.id = tu.page_id
    `;

    const rows = scope === "text_unit"
      ? this.db.prepare(`${select} WHERE tu.id = ? AND tu.chapter_id = ? ORDER BY tu.unit_order ASC`)
        .all(String(input.textUnitId ?? ""), chapter.id)
      : scope === "page"
        ? this.db.prepare(`${select} WHERE tu.chapter_id = ? AND tu.page_id = ? ORDER BY tu.unit_order ASC`)
          .all(chapter.id, String(input.pageId ?? ""))
        : this.db.prepare(`${select} WHERE tu.chapter_id = ? ORDER BY tu.unit_order ASC`)
          .all(chapter.id);

    return rows
      .map((row) => {
        const rawSourceText = normalizeString(row.source_final_text ?? row.source_ocr_text);
        return {
          ...row,
          rawSourceText,
          normalizedSourceText: normalizeSourceText(rawSourceText, chapter.source_language),
        };
      })
      .filter((row) => row.normalizedSourceText.length > 0);
  }

  getCharacterRows(projectId) {
    const characters = this.db.prepare(`
      SELECT *
      FROM characters
      WHERE project_id = ?
      ORDER BY english_name COLLATE NOCASE ASC
    `).all(projectId);
    const aliases = this.db.prepare(`
      SELECT ca.*
      FROM character_aliases ca
      JOIN characters c ON c.id = ca.character_id
      WHERE c.project_id = ?
      ORDER BY ca.english_alias COLLATE NOCASE ASC
    `).all(projectId);
    const aliasesByCharacter = new Map();
    for (const alias of aliases) {
      const group = aliasesByCharacter.get(alias.character_id) ?? [];
      group.push({
        arabic: alias.arabic_alias,
        english: alias.english_alias,
      });
      aliasesByCharacter.set(alias.character_id, group);
    }
    return characters.map((row) => ({
      aliases: aliasesByCharacter.get(row.id) ?? [],
      arabicName: row.arabic_name,
      description: optionalString(row.description),
      englishName: row.english_name,
      gender: row.gender,
      id: row.id,
    }));
  }

  getTermRows(projectId) {
    return this.db.prepare(`
      SELECT *
      FROM glossary_terms
      WHERE project_id = ?
      ORDER BY category COLLATE NOCASE ASC, english_term COLLATE NOCASE ASC
    `).all(projectId).map((row) => ({
      arabicTerm: row.arabic_term,
      category: row.category ?? "General Term",
      description: optionalString(row.description),
      englishTerm: row.english_term,
      id: row.id,
    }));
  }

  getMatchedDictionaryIds(textUnitIds) {
    if (textUnitIds.length === 0) {
      return {
        characterIds: new Set(),
        termIds: new Set(),
      };
    }
    const placeholders = textUnitIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT character_id, glossary_term_id
      FROM dictionary_matches
      WHERE text_unit_id IN (${placeholders})
    `).all(...textUnitIds);
    return {
      characterIds: new Set(rows.map((row) => row.character_id).filter(Boolean)),
      termIds: new Set(rows.map((row) => row.glossary_term_id).filter(Boolean)),
    };
  }

  relevantDictionary(projectId, rows) {
    const allCharacters = this.getCharacterRows(projectId);
    const allTerms = this.getTermRows(projectId);
    const corpus = rows.map((row) => row.normalizedSourceText).join("\n");
    const matched = this.getMatchedDictionaryIds(rows.map((row) => row.id));
    const smallDictionary = allCharacters.length <= 80 && allTerms.length <= 160;

    const characters = allCharacters.filter((character) =>
      smallDictionary ||
      matched.characterIds.has(character.id) ||
      textContains(corpus, character.englishName) ||
      character.aliases.some((alias) => textContains(corpus, alias.english)),
    );
    const terms = allTerms.filter((term) =>
      smallDictionary ||
      matched.termIds.has(term.id) ||
      textContains(corpus, term.englishTerm),
    );

    return {
      characters,
      terms,
    };
  }

  previousTranslations(chapterId, firstOrder) {
    return this.db.prepare(`
      SELECT
        tu.id,
        tu.source_final_text,
        tu.source_ocr_text,
        tu.final_translation,
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
        AND tu.unit_order < ?
      ORDER BY tu.unit_order DESC
      LIMIT 24
    `).all(chapterId, firstOrder)
      .reverse()
      .map((row) => ({
        arabicText: normalizeString(row.final_translation || row.ai_translation || row.microsoft_translation),
        sourceText: normalizeString(row.source_final_text || row.source_ocr_text),
        textUnitId: row.id,
      }))
      .filter((row) => row.sourceText && row.arabicText);
  }

  buildRequest(chapter, rows, input, previousTranslations) {
    const translationLevel = normalizeTranslationLevel(input.translationLevel);
    const dictionary = this.relevantDictionary(chapter.project_id, rows);
    const sourceLanguage = normalizeLanguageCode(input.sourceLanguage ?? chapter.source_language, "en");
    const targetLanguage = normalizeLanguageCode(input.targetLanguage ?? chapter.target_language, "ar");
    const genres = parseJson(chapter.genres_json, []);
    return {
      chapter: {
        chapterId: chapter.id,
        chapterNumber: chapter.number ?? null,
        previousSummary: null,
        sceneNotes: null,
        summary: null,
        title: chapter.title ?? chapter.display_label ?? null,
      },
      glossary: dictionary,
      job: {
        applyGlossaryStrictly: input.applyGlossaryStrictly !== false,
        mode: normalizeMode(input.mode),
        preferConciseBubbleText: input.preferConciseBubbleText !== false,
        scope: normalizeScope(input.scope),
        sourceLanguage,
        targetLanguage,
        translationLevel,
      },
      previousTranslations,
      project: {
        arabicTitle: optionalString(chapter.arabic_title),
        genre: genres.length > 0 ? genres.join(", ") : null,
        projectId: chapter.project_id,
        synopsis: optionalString(chapter.context_summary || chapter.project_description || chapter.context_markdown),
        title: chapter.project_title,
        toneNotes: null,
        translationNotes: optionalString(chapter.context_markdown),
      },
      units: rows.map((row, index) => ({
        boundingBox: this.normalizeBoundingBox(row),
        currentArabicText: optionalString(row.final_translation || row.ai_translation),
        microsoftTranslation: optionalString(row.microsoft_translation),
        neighboringText: {
          next: rows[index + 1]
            ? [{
              arabicText: optionalString(rows[index + 1].final_translation || rows[index + 1].ai_translation),
              sourceText: rows[index + 1].normalizedSourceText,
              textUnitId: rows[index + 1].id,
            }]
            : [],
          previous: rows[index - 1]
            ? [{
              arabicText: optionalString(rows[index - 1].final_translation || rows[index - 1].ai_translation),
              sourceText: rows[index - 1].normalizedSourceText,
              textUnitId: rows[index - 1].id,
            }]
            : [],
        },
        normalizedSourceText: row.normalizedSourceText === row.rawSourceText ? null : row.normalizedSourceText,
        ocrConfidence: clampConfidence(row.ocr_confidence),
        pageId: row.page_id,
        pageIndex: Number(row.page_index ?? 0),
        sequenceIndex: Number(row.unit_order ?? index + 1),
        sourceText: row.rawSourceText,
        speakerCharacterId: null,
        textUnitId: row.id,
      })),
      version: AI_REQUEST_VERSION,
    };
  }

  normalizeBoundingBox(row) {
    const region = parseJson(row.region_json, null);
    if (!region || typeof region !== "object") return null;
    const x = Number(region.x);
    const y = Number(region.y);
    const width = Number(region.width);
    const height = Number(region.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return {
      height,
      pageHeight: row.page_height == null ? null : Number(row.page_height),
      pageWidth: row.page_width == null ? null : Number(row.page_width),
      width,
      x,
      y,
    };
  }

  createRun(chapterId, input, settings, timestamp) {
    const runId = aiTranslationRunId();
    this.db.prepare(`
      INSERT INTO translation_runs (
        id, chapter_id, provider, model, settings_json, used_context,
        used_dictionary, started_at, completed_at, status, error_message
      ) VALUES (?, ?, 'ai', ?, ?, 1, 1, ?, NULL, 'running', NULL)
    `).run(
      runId,
      chapterId,
      settings.model,
      JSON.stringify({
        activeKeyId: settings.apiKeys?.[0]?.id ?? null,
        aiProvider: settings.providerId,
        batchSize: normalizeBatchSize(input.batchSize),
        mode: normalizeMode(input.mode),
        pageId: input.pageId ?? null,
        requestVersion: AI_REQUEST_VERSION,
        scope: normalizeScope(input.scope),
        textUnitId: input.textUnitId ?? null,
        translationLevel: normalizeTranslationLevel(input.translationLevel),
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

  saveCandidates(runId, translations, rowsById, settings, timestamp, startIndex) {
    let saved = 0;
    this.db.exec("BEGIN");
    try {
      for (const [index, translation] of translations.entries()) {
        const row = rowsById.get(translation.textUnitId);
        if (!row) continue;
        this.db.prepare(`
          INSERT INTO translation_candidates (
            id, translation_run_id, text_unit_id, provider, translated_text,
            confidence, metadata_json, created_at
          ) VALUES (?, ?, ?, 'ai', ?, ?, ?, ?)
        `).run(
          aiTranslationCandidateId(runId, startIndex + index),
          runId,
          translation.textUnitId,
          translation.arabicText,
          translation.confidence,
          JSON.stringify({
            aiProvider: settings.providerId,
            fit: translation.fit,
            model: settings.model,
            notes: translation.notes,
            sourceText: translation.sourceText || row.rawSourceText,
            styleLevel: translation.styleLevel,
            usedTerms: translation.usedTerms,
            warnings: translation.warnings,
          }),
          timestamp,
        );
        saved += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return saved;
  }

  touchChapter(chapterId, translatedCount, timestamp) {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`
        UPDATE chapters
        SET internal_status = CASE WHEN ? > 0 THEN 'Draft Translated' ELSE internal_status END,
            updated_at = ?
        WHERE id = ?
      `).run(translatedCount, timestamp, chapterId);
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
  }

  async translate(input = {}) {
    const chapterId = normalizeString(input.chapterId);
    if (!chapterId) throw new Error("Chapter is required for AI translation.");

    const settings = aiProviderSettings(input, { configPath: this.configPath });
    const chapter = this.getChapterContext(chapterId);
    const rows = this.listTextRows(input, chapter);
    const timestamp = new Date().toISOString();
    const runId = this.createRun(chapterId, input, settings, timestamp);

    if (rows.length === 0) {
      this.completeRun(runId, "completed");
      return {
        chapterId,
        failedCount: 0,
        provider: "ai",
        runId,
        status: "completed",
        translatedCount: 0,
      };
    }

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const batchSize = normalizeBatchSize(input.batchSize);
    const batches = chunkArray(rows, batchSize);
    const agentInstructions = this.getAgentInstructions();
    const translatedSoFar = [];
    let translatedCount = 0;
    const runWarnings = [];

    const translateBatch = async (batch) => {
      try {
        const previous = [
          ...this.previousTranslations(chapterId, Number(batch[0]?.unit_order ?? 0)),
          ...translatedSoFar.slice(-24).map((item) => ({
            arabicText: item.arabicText,
            sourceText: item.sourceText,
            textUnitId: item.textUnitId,
          })),
        ];
        const request = this.buildRequest(chapter, batch, input, previous);
        const providerPayload = await callOpenAiCompatibleProvider(request, settings, agentInstructions);
        const normalized = normalizeAiResponse(
          providerPayload,
          batch.map((row) => row.id),
          normalizeTranslationLevel(input.translationLevel),
        );
        runWarnings.push(...normalized.runWarnings);
        const saved = this.saveCandidates(
          runId,
          normalized.translations,
          rowsById,
          settings,
          timestamp,
          translatedCount,
        );
        translatedCount += saved;
        translatedSoFar.push(...normalized.translations);
      } catch (error) {
        if (batch.length <= 1 || !isRecoverableAiBatchError(error)) {
          throw error;
        }
        const midpoint = Math.ceil(batch.length / 2);
        runWarnings.push({
          code: "ai_batch_split",
          message: `Split AI translation batch of ${batch.length} text units after provider response error.`,
        });
        await translateBatch(batch.slice(0, midpoint));
        await translateBatch(batch.slice(midpoint));
      }
    };

    try {
      for (const batch of batches) {
        await translateBatch(batch);
      }

      this.touchChapter(chapterId, translatedCount, timestamp);
      this.completeRun(runId, "completed", runWarnings.length > 0 ? JSON.stringify(runWarnings) : null);
      return {
        chapterId,
        failedCount: Math.max(0, rows.length - translatedCount),
        provider: "ai",
        runId,
        status: "completed",
        translatedCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.completeRun(runId, "failed", message);
      throw error;
    }
  }
}

module.exports = {
  AiTranslationService,
  normalizeSourceText,
};
