const { OcrProviderRegistry } = require("../ocr/provider-registry.cjs");
const { OcrRepository } = require("../data/repositories/ocr-repository.cjs");

function normalizeRunOptions(input) {
  return {
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
    this.repository = new OcrRepository(db, { workspacePath: options.workspacePath });
    this.registry = new OcrProviderRegistry();
  }

  listProviders(languageHint = "") {
    return this.registry.listProviderStatuses(languageHint);
  }

  async runPage(pageId, input) {
    const options = normalizeRunOptions(input);
    const page = this.repository.getPageForOcr(pageId);
    const run = this.repository.createRun({
      chapterId: page.chapterId,
      languageHint: options.languageHint,
      mode: "page",
      provider: options.providerId,
      settings: { replaceExisting: options.replaceExisting },
    });

    try {
      const result = await this.registry.recognizePage(options.providerId, page, {
        languageHint: options.languageHint,
      });
      return this.repository.applyRecognition({
        languageDetected: result.languageDetected,
        pageResults: [{ items: result.items, page }],
        provider: options.providerId,
        replaceExisting: options.replaceExisting,
        run,
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
          recognizedItems = focusRegionItems(retryResult.items, selectedRegion, page);
        }
      }

      if (recognizedItems.length === 0) {
        throw new Error("No text was recognized in the selected area. Select a larger part of the bubble.");
      }

      return this.repository.applyRecognition({
        languageDetected: result.languageDetected,
        pageResults: [{ items: recognizedItems, page, replaceRegion: selectedRegion }],
        provider: options.providerId,
        replaceExisting: options.replaceExisting,
        run,
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
      settings: { pagesCount: pages.length, replaceExisting: options.replaceExisting },
    });

    try {
      const pageResults = [];
      let languageDetected = null;
      for (const page of pages) {
        const result = await this.registry.recognizePage(options.providerId, page, {
          languageHint: options.languageHint,
        });
        if (!languageDetected && result.languageDetected) languageDetected = result.languageDetected;
        pageResults.push({ items: result.items, page });
      }

      return this.repository.applyRecognition({
        languageDetected,
        pageResults,
        provider: options.providerId,
        replaceExisting: options.replaceExisting,
        run,
      });
    } catch (error) {
      this.repository.failRun(run, error);
      throw error;
    }
  }

  updateTextUnitSource(textUnitId, input) {
    return this.repository.updateTextUnitSource(textUnitId, input);
  }
}

module.exports = {
  OcrService,
};
