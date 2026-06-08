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
      return this.repository.applyRecognition({
        languageDetected: result.languageDetected,
        pageResults: [{ items: result.items, page, replaceRegion: expandedRegion }],
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
