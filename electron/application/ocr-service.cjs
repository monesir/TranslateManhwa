const { OcrProviderRegistry } = require("../ocr/provider-registry.cjs");
const { OcrRepository } = require("../data/repositories/ocr-repository.cjs");

function normalizeRunOptions(input) {
  return {
    languageHint: String(input?.languageHint ?? "").trim() || undefined,
    providerId: String(input?.providerId ?? "windows"),
    replaceExisting: input?.replaceExisting !== false,
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
