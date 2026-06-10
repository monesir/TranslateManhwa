const { ProjectRepository } = require("../data/repositories/project-repository.cjs");
const { ChapterRepository } = require("../data/repositories/chapter-repository.cjs");
const { ChapterPageStore } = require("../data/chapter-page-store.cjs");
const { CoverCache } = require("../data/cover-cache.cjs");
const { DictionaryRepository } = require("../data/repositories/dictionary-repository.cjs");
const { OcrService } = require("./ocr-service.cjs");
const { PageColorService } = require("./page-color-service.cjs");
const { PageCleanService } = require("./page-clean-service.cjs");
const {
  SourceImportRepository,
  sourceChapterId,
} = require("../data/repositories/source-import-repository.cjs");
const {
  TranslationWorkspaceRepository,
} = require("../data/repositories/translation-workspace-repository.cjs");
const {
  browseSourceTitles,
  getSourceChapterPages,
  getSourceTitleDetails,
  listSourceCatalog,
  searchSourceTitles,
} = require("../sources/source-registry.cjs");

function createAppApi(db, options = {}) {
  const projectRepository = new ProjectRepository(db);
  const dictionaryRepository = new DictionaryRepository(db);
  const coverCache = options.workspacePath ? new CoverCache(options.workspacePath) : null;
  const chapterPageStore = options.workspacePath ? new ChapterPageStore(options.workspacePath) : null;
  const chapterRepository = new ChapterRepository(db, { chapterPageStore });
  const sourceImportRepository = new SourceImportRepository(db, { chapterPageStore, coverCache });
  const translationWorkspaceRepository = new TranslationWorkspaceRepository(db);
  const ocrService = new OcrService(db, { workspacePath: options.workspacePath });
  const pageColorService = new PageColorService(db, { workspacePath: options.workspacePath });
  const pageCleanService = new PageCleanService(db, { workspacePath: options.workspacePath });

  return {
    listProjects() {
      return projectRepository.listLibraryProjects();
    },

    createProject(input) {
      return projectRepository.createProject(input);
    },

    getLibraryStats() {
      return projectRepository.getLibraryStats();
    },

    getProjectOverview(projectId) {
      return projectRepository.getProjectOverview(projectId);
    },

    listProjectChapters(projectId) {
      return chapterRepository.listProjectChapters(projectId);
    },

    createProjectChapter(projectId, input) {
      return chapterRepository.createProjectChapter(projectId, input);
    },

    getProjectDictionary(projectId) {
      return dictionaryRepository.getProjectDictionary(projectId);
    },

    getChapterForTranslation(chapterId) {
      return translationWorkspaceRepository.getChapterForTranslation(chapterId);
    },

    updateFinalTranslation(textUnitId, text) {
      return translationWorkspaceRepository.updateFinalTranslation(textUnitId, text);
    },

    deleteTextUnit(textUnitId) {
      return translationWorkspaceRepository.deleteTextUnit(textUnitId);
    },

    updateTextUnitTypesetting(textUnitId, input) {
      return translationWorkspaceRepository.updateTextUnitTypesetting(textUnitId, input);
    },

    updateChapterTextSize(chapterId, input) {
      return translationWorkspaceRepository.updateChapterTextSize(chapterId, input);
    },

    addPageEditMark(input) {
      return translationWorkspaceRepository.addPageEditMark(input);
    },

    deletePageEditMark(markId) {
      return translationWorkspaceRepository.deletePageEditMark(markId);
    },

    samplePageColor(pageId, input) {
      return pageColorService.samplePageColor(pageId, input);
    },

    cleanPageText(pageId, input) {
      return pageCleanService.cleanText(pageId, input);
    },

    listOcrProviders(languageHint) {
      return ocrService.listProviders(languageHint);
    },

    runOcrForPage(pageId, input) {
      return ocrService.runPage(pageId, input);
    },

    runOcrForRegion(pageId, input) {
      return ocrService.runRegion(pageId, input);
    },

    runOcrForChapter(chapterId, input) {
      return ocrService.runChapter(chapterId, input);
    },

    updateTextUnitSource(textUnitId, input) {
      return ocrService.updateTextUnitSource(textUnitId, input);
    },

    addCharacter(projectId, input) {
      return dictionaryRepository.addCharacter(projectId, input);
    },

    updateCharacter(characterId, input) {
      return dictionaryRepository.updateCharacter(characterId, input);
    },

    deleteCharacter(characterId) {
      return dictionaryRepository.deleteCharacter(characterId);
    },

    addCharacterAlias(characterId, input) {
      return dictionaryRepository.addCharacterAlias(characterId, input);
    },

    addGlossaryTerm(projectId, input) {
      return dictionaryRepository.addGlossaryTerm(projectId, input);
    },

    updateGlossaryTerm(termId, input) {
      return dictionaryRepository.updateGlossaryTerm(termId, input);
    },

    deleteGlossaryTerm(termId) {
      return dictionaryRepository.deleteGlossaryTerm(termId);
    },

    listSourceCatalog() {
      return listSourceCatalog();
    },

    browseSourceTitles(sourceId, page) {
      return browseSourceTitles(sourceId, page);
    },

    searchSourceTitles(sourceId, query, page) {
      return searchSourceTitles(sourceId, query, page);
    },

    getSourceTitleDetails(sourceId, titleId) {
      return getSourceTitleDetails(sourceId, titleId);
    },

    getSourceChapterPages(sourceId, titleId, chapterId) {
      return getSourceChapterPages(sourceId, titleId, chapterId);
    },

    async ensureSourceProject(sourceId, titleId) {
      const sourceResult = await getSourceTitleDetails(sourceId, titleId);
      return sourceImportRepository.ensureProject(sourceId, sourceResult);
    },

    async prepareSourceChapter(sourceId, titleId, chapterId) {
      const sourceResult = await getSourceTitleDetails(sourceId, titleId);
      const chapter = sourceResult.chapters.find((item) => item.chapterId === chapterId);

      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      const pages = await getSourceChapterPages(sourceId, titleId, chapterId);
      return sourceImportRepository.prepareChapter(sourceId, sourceResult, chapter, pages);
    },

    cacheLibraryCovers() {
      return sourceImportRepository.cacheExistingLibraryCovers();
    },

    async prepareLibraryChapter(chapterId) {
      const chapter = chapterRepository.getChapter(chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      if (sourceImportRepository.isChapterDownloaded(chapterId)) {
        const downloadedChapter = chapterRepository.getChapter(chapterId);
        return {
          projectId: chapter.projectId,
          chapterId: chapter.id,
          pagesCount: downloadedChapter.pagesCount,
          chapter: downloadedChapter,
        };
      }

      const source = sourceImportRepository.getChapterSource(chapterId);
      if (!source) {
        throw new Error("Chapter pages are not prepared and no source link is available");
      }

      const sourceResult = await getSourceTitleDetails(source.sourceId, source.titleId);
      const sourceChapter = sourceResult.chapters.find(
        (item) => sourceChapterId(source.projectId, item.chapterId) === chapterId,
      );

      if (!sourceChapter) {
        throw new Error(`Source chapter not found for local chapter: ${chapterId}`);
      }

      const pages = await getSourceChapterPages(source.sourceId, source.titleId, sourceChapter.chapterId);
      return sourceImportRepository.prepareChapter(source.sourceId, sourceResult, sourceChapter, pages);
    },
  };
}

module.exports = {
  createAppApi,
};
