const { PageCleanService } = require("./page-clean-service.cjs");
const { OcrProviderRegistry } = require("../ocr/provider-registry.cjs");
const { OcrRepository } = require("../data/repositories/ocr-repository.cjs");

function normalizeRunOptions(input) {
  const maskExpansion = Number(input?.autoCleanMaskExpansion ?? 4);
  const feather = Number(input?.autoCleanFeather ?? 2);
  return {
    autoCleanPolicy: String(input?.autoCleanPolicy ?? "safe_bubbles_only"),
    autoCleanProvider: String(input?.autoCleanProvider ?? "bubble_fill"),
    autoCleanSettings: {
      feather: Number.isFinite(feather) ? clamp(Math.round(feather), 0, 16) : 2,
      maskExpansion: Number.isFinite(maskExpansion) ? clamp(Math.round(maskExpansion), 0, 18) : 4,
      method: "telea",
    },
    autoCleanText: input?.autoCleanText === true,
    languageHint: String(input?.languageHint ?? "").trim() || undefined,
    providerId: String(input?.providerId ?? "windows"),
    replaceExisting: input?.replaceExisting !== false,
  };
}

function numberOrZero(value) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, normalized);
}

function normalizeExpansion(expansion) {
  if (typeof expansion === "number") {
    const value = numberOrZero(expansion);
    return { bottom: value, left: value, right: value, top: value };
  }

  return {
    bottom: numberOrZero(expansion?.bottom),
    left: numberOrZero(expansion?.left),
    right: numberOrZero(expansion?.right),
    top: numberOrZero(expansion?.top),
  };
}

const REGION_RETRY_EXPANSION = { bottom: 64, left: 96, right: 144, top: 64 };
const REGION_FOCUS_EXPANSION = { bottom: 18, left: 18, right: 18, top: 18 };
const AUTO_CLEAN_REGION_EXPANSION = { bottom: 4, left: 6, right: 6, top: 4 };
const AUTO_CLEAN_CONTEXT_EXPANSION = { bottom: 48, left: 64, right: 64, top: 48 };
const AUTO_CLEAN_MASK_EXPANSION = { bottom: 14, left: 18, right: 18, top: 14 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRegion(input, page) {
  const x = Number(input?.x ?? 0);
  const y = Number(input?.y ?? 0);
  const width = Number(input?.width ?? 0);
  const height = Number(input?.height ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("OCR region contains invalid coordinates");
  }
  if (width < 4 || height < 4) {
    throw new Error("OCR region is too small");
  }

  const safeX = clamp(x, 0, page.width - 1);
  const safeY = clamp(y, 0, page.height - 1);
  const right = clamp(x + width, safeX + 1, page.width);
  const bottom = clamp(y + height, safeY + 1, page.height);
  return {
    type: "box",
    x: safeX,
    y: safeY,
    width: right - safeX,
    height: bottom - safeY,
  };
}

function expandRegion(region, expansion, page) {
  const x = clamp(region.x - expansion.left, 0, page.width - 1);
  const y = clamp(region.y - expansion.top, 0, page.height - 1);
  const right = clamp(region.x + region.width + expansion.right, x + 1, page.width);
  const bottom = clamp(region.y + region.height + expansion.bottom, y + 1, page.height);
  return {
    type: "box",
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function expandAutoCleanRegion(region, page) {
  return expandRegion(normalizeRegion(region, page), AUTO_CLEAN_REGION_EXPANSION, page);
}

function usesContextualAutoClean(provider) {
  return provider === "algorithm" || provider === "free_text_inpaint" || provider === "lama";
}

function autoCleanRegions(region, page, provider) {
  const normalizedRegion = normalizeRegion(region, page);
  if (!usesContextualAutoClean(provider)) {
    return {
      maskRegion: null,
      region: expandRegion(normalizedRegion, AUTO_CLEAN_REGION_EXPANSION, page),
    };
  }

  return {
    maskRegion: expandRegion(normalizedRegion, AUTO_CLEAN_MASK_EXPANSION, page),
    region: expandRegion(normalizedRegion, AUTO_CLEAN_CONTEXT_EXPANSION, page),
  };
}

function regionRight(region) {
  return Number(region?.x ?? 0) + Number(region?.width ?? 0);
}

function regionBottom(region) {
  return Number(region?.y ?? 0) + Number(region?.height ?? 0);
}

function regionsIntersect(first, second) {
  return !(
    regionRight(first) < Number(second?.x ?? 0) ||
    regionRight(second) < Number(first?.x ?? 0) ||
    regionBottom(first) < Number(second?.y ?? 0) ||
    regionBottom(second) < Number(first?.y ?? 0)
  );
}

function regionsEqual(first, second) {
  return (
    Math.round(first.x) === Math.round(second.x) &&
    Math.round(first.y) === Math.round(second.y) &&
    Math.round(first.width) === Math.round(second.width) &&
    Math.round(first.height) === Math.round(second.height)
  );
}

function focusRegionItems(items, selectedRegion, page) {
  const allItems = Array.isArray(items) ? items : [];
  if (allItems.length === 0) return [];
  const focusRegion = expandRegion(selectedRegion, REGION_FOCUS_EXPANSION, page);
  const focusedItems = allItems.filter((item) => regionsIntersect(item.region, focusRegion));
  return focusedItems.length > 0 ? focusedItems : allItems;
}

class OcrService {
  constructor(db, options = {}) {
    this.cleanService = new PageCleanService(db, { workspacePath: options.workspacePath });
    this.repository = new OcrRepository(db, { workspacePath: options.workspacePath });
    this.registry = new OcrProviderRegistry();
  }

  listProviders(languageHint = "") {
    return this.registry.listProviderStatuses(languageHint);
  }

  async autoCleanTargets(cleanTargets, { policy, provider, run, settings, source }) {
    const cleanErrors = [];
    const cleanedRegions = new Set();
    let cleanPatchesCreated = 0;
    let cleanSkipped = 0;

    for (const target of cleanTargets) {
      const pageId = target?.page?.pageId ?? target?.pageId;
      const region = target?.region;
      if (!pageId || !region || !target?.page) continue;

      const regionKey = [
        pageId,
        Math.round(Number(region.x ?? 0)),
        Math.round(Number(region.y ?? 0)),
        Math.round(Number(region.width ?? 0)),
        Math.round(Number(region.height ?? 0)),
      ].join(":");
      if (cleanedRegions.has(regionKey)) continue;
      cleanedRegions.add(regionKey);

      try {
        const regions = autoCleanRegions(region, target.page, provider);
        const cleanResult = await this.cleanService.cleanText(pageId, {
          ...settings,
          maskRegion: regions.maskRegion,
          mode: "auto_after_ocr",
          policy,
          provider,
          region: regions.region,
          source,
          sourceOcrRunId: run.id,
          sourceTextUnitId: target.id,
        });
        if (cleanResult?.skipped) {
          cleanSkipped += 1;
        } else {
          cleanPatchesCreated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        cleanErrors.push(`Page ${target.page.pageIndex + 1}: ${message}`);
      }
    }

    return {
      cleanErrors: cleanErrors.slice(0, 5),
      cleanPatchesCreated,
      cleanSkipped,
    };
  }

  async applyRecognitionWithOptionalClean({
    autoCleanPolicy,
    autoCleanProvider,
    autoCleanSettings,
    autoCleanText,
    languageDetected,
    pageResults,
    provider,
    replaceExisting,
    run,
    source,
  }) {
    const summary = this.repository.applyRecognition({
      languageDetected,
      pageResults,
      provider,
      replaceExisting,
      run,
    });

    if (!autoCleanText) return summary;

    const cleanSummary = await this.autoCleanTargets(summary.createdTextUnits ?? [], {
      policy: autoCleanPolicy,
      provider: autoCleanProvider,
      run,
      settings: autoCleanSettings,
      source,
    });
    return {
      ...summary,
      ...cleanSummary,
    };
  }

  async runPage(pageId, input) {
    const options = normalizeRunOptions(input);
    const page = this.repository.getPageForOcr(pageId);
    const run = this.repository.createRun({
      chapterId: page.chapterId,
      languageHint: options.languageHint,
      mode: "page",
      provider: options.providerId,
      settings: {
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        replaceExisting: options.replaceExisting,
      },
    });

    try {
      const result = await this.registry.recognizePage(options.providerId, page, {
        languageHint: options.languageHint,
      });
      return this.applyRecognitionWithOptionalClean({
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        languageDetected: result.languageDetected,
        pageResults: [{ items: result.items, page }],
        provider: result.providerId ?? options.providerId,
        replaceExisting: options.replaceExisting,
        run,
        source: "ocr_page",
      });
    } catch (error) {
      this.repository.failRun(run, error);
      throw error;
    }
  }

  async runRegion(pageId, input) {
    const options = normalizeRunOptions(input);
    const page = this.repository.getPageForOcr(pageId);
    const selectedRegion = normalizeRegion(input?.region, page);
    const expansion = normalizeExpansion(input?.expansion);
    const expandedRegion = expandRegion(selectedRegion, expansion, page);
    const run = this.repository.createRun({
      chapterId: page.chapterId,
      languageHint: options.languageHint,
      mode: "region",
      provider: options.providerId,
      settings: {
        expandedRegion,
        expansion,
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        replaceExisting: options.replaceExisting,
        selectedRegion,
      },
    });

    try {
      const result = await this.registry.recognizeRegion(options.providerId, page, expandedRegion, {
        languageHint: options.languageHint,
      });
      let recognizedItems = focusRegionItems(result.items, selectedRegion, page);

      if (recognizedItems.length === 0) {
        const retryRegion = expandRegion(selectedRegion, REGION_RETRY_EXPANSION, page);
        if (!regionsEqual(retryRegion, expandedRegion)) {
          const retryResult = await this.registry.recognizeRegion(options.providerId, page, retryRegion, {
            languageHint: options.languageHint,
          });
          result.languageDetected = retryResult.languageDetected ?? result.languageDetected;
          result.providerId = retryResult.providerId ?? result.providerId;
          recognizedItems = focusRegionItems(retryResult.items, selectedRegion, page);
        }
      }

      if (recognizedItems.length === 0) {
        throw new Error("No text was recognized in the selected area. Select a larger part of the bubble.");
      }

      return this.applyRecognitionWithOptionalClean({
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        languageDetected: result.languageDetected,
        pageResults: [{ items: recognizedItems, page, replaceRegion: selectedRegion }],
        provider: result.providerId ?? options.providerId,
        replaceExisting: options.replaceExisting,
        run,
        source: "ocr_region",
      });
    } catch (error) {
      this.repository.failRun(run, error);
      throw error;
    }
  }

  async runChapter(chapterId, input) {
    const options = normalizeRunOptions(input);
    const pages = this.repository.listChapterPagesForOcr(chapterId);
    if (pages.length === 0) {
      throw new Error("Chapter has no local pages for OCR");
    }

    const run = this.repository.createRun({
      chapterId,
      languageHint: options.languageHint,
      mode: "batch",
      provider: options.providerId,
      settings: {
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        pagesCount: pages.length,
        replaceExisting: options.replaceExisting,
      },
    });

    try {
      const pageResults = [];
      let languageDetected = null;
      for (const page of pages) {
        const result = await this.registry.recognizePage(options.providerId, page, {
          languageHint: options.languageHint,
        });
        if (!languageDetected && result.languageDetected) languageDetected = result.languageDetected;
        pageResults.push({ items: result.items, page, provider: result.providerId ?? options.providerId });
      }

      return this.applyRecognitionWithOptionalClean({
        autoCleanPolicy: options.autoCleanPolicy,
        autoCleanProvider: options.autoCleanProvider,
        autoCleanSettings: options.autoCleanSettings,
        autoCleanText: options.autoCleanText,
        languageDetected,
        pageResults,
        provider: pageResults.find((pageResult) => pageResult.provider !== options.providerId)?.provider ?? options.providerId,
        replaceExisting: options.replaceExisting,
        run,
        source: "ocr_chapter",
      });
    } catch (error) {
      this.repository.failRun(run, error);
      throw error;
    }
  }

  updateTextUnitSource(textUnitId, input) {
    return this.repository.updateTextUnitSource(textUnitId, input);
  }

  deleteResults(input = {}) {
    const chapterId = String(input.chapterId ?? "");
    const pageId = String(input.pageId ?? "");
    if (!chapterId) throw new Error("Chapter is required to delete OCR results");
    const includeAutoCleanPatches = input.includeAutoCleanPatches !== false;
    const timestamp = new Date().toISOString();
    const textUnitRows = pageId
      ? this.repository.db.prepare("SELECT id FROM text_units WHERE chapter_id = ? AND page_id = ?").all(chapterId, pageId)
      : this.repository.db.prepare("SELECT id FROM text_units WHERE chapter_id = ?").all(chapterId);
    const textUnitIds = textUnitRows.map((row) => row.id);
    const placeholders = textUnitIds.map(() => "?").join(",");
    const pageCondition = pageId ? "chapter_id = ? AND page_id = ?" : "chapter_id = ?";
    const pageArgs = pageId ? [chapterId, pageId] : [chapterId];

    const translationCandidatesDeleted = textUnitIds.length > 0
      ? Number(this.repository.db.prepare(`
          SELECT COUNT(*) AS count FROM translation_candidates
          WHERE text_unit_id IN (${placeholders})
        `).get(...textUnitIds)?.count ?? 0)
      : 0;
    const candidatesDeleted = textUnitIds.length > 0
      ? Number(this.repository.db.prepare(`
          SELECT COUNT(*) AS count FROM ocr_candidates
          WHERE text_unit_id IN (${placeholders})
        `).get(...textUnitIds)?.count ?? 0)
      : 0;
    const autoCleanPatchesDeleted = includeAutoCleanPatches
      ? Number(this.repository.db.prepare(`
          SELECT COUNT(*) AS count
          FROM page_clean_patches
          WHERE ${pageCondition}
            AND (
              mode = 'auto_after_ocr'
              OR source IN ('ocr_page', 'ocr_region', 'ocr_chapter')
              OR source_ocr_run_id IS NOT NULL
            )
        `).get(...pageArgs)?.count ?? 0)
      : 0;
    const manualEditsKept = Number(this.repository.db.prepare(`
      SELECT COUNT(*) AS count FROM page_edit_marks WHERE ${pageCondition}
    `).get(...pageArgs)?.count ?? 0);

    this.repository.db.exec("BEGIN");
    try {
      if (includeAutoCleanPatches) {
        this.repository.db.prepare(`
          DELETE FROM page_clean_patches
          WHERE ${pageCondition}
            AND (
              mode = 'auto_after_ocr'
              OR source IN ('ocr_page', 'ocr_region', 'ocr_chapter')
              OR source_ocr_run_id IS NOT NULL
            )
        `).run(...pageArgs);
      }
      if (textUnitIds.length > 0) {
        this.repository.db.prepare(`DELETE FROM translation_candidates WHERE text_unit_id IN (${placeholders})`).run(...textUnitIds);
        this.repository.db.prepare(`DELETE FROM dictionary_matches WHERE text_unit_id IN (${placeholders})`).run(...textUnitIds);
        this.repository.db.prepare(`DELETE FROM typesetting_items WHERE text_unit_id IN (${placeholders})`).run(...textUnitIds);
        this.repository.db.prepare(`DELETE FROM ocr_candidates WHERE text_unit_id IN (${placeholders})`).run(...textUnitIds);
        this.repository.db.prepare(`DELETE FROM text_units WHERE id IN (${placeholders})`).run(...textUnitIds);
      }
      if (!pageId) {
        this.repository.db.prepare("DELETE FROM ocr_runs WHERE chapter_id = ?").run(chapterId);
      }
      this.repository.db.prepare("UPDATE chapters SET internal_status = 'Images Ready', updated_at = ? WHERE id = ?").run(timestamp, chapterId);
      this.repository.db.prepare(`
        UPDATE projects
        SET updated_at = ?
        WHERE id = (SELECT project_id FROM chapters WHERE id = ?)
      `).run(timestamp, chapterId);
      this.repository.db.exec("COMMIT");
    } catch (error) {
      this.repository.db.exec("ROLLBACK");
      throw error;
    }

    return {
      autoCleanPatchesDeleted,
      candidatesDeleted,
      chapterId,
      manualEditsKept,
      pageId: pageId || undefined,
      textUnitsDeleted: textUnitIds.length,
      translationCandidatesDeleted,
    };
  }
}

module.exports = {
  OcrService,
};
