const { ProjectRepository } = require("../data/repositories/project-repository.cjs");
const { ChapterRepository } = require("../data/repositories/chapter-repository.cjs");
const { DictionaryRepository } = require("../data/repositories/dictionary-repository.cjs");
const { SourceImportRepository } = require("../data/repositories/source-import-repository.cjs");
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

function createAppApi(db) {
  const projectRepository = new ProjectRepository(db);
  const chapterRepository = new ChapterRepository(db);
  const dictionaryRepository = new DictionaryRepository(db);
  const sourceImportRepository = new SourceImportRepository(db);
  const translationWorkspaceRepository = new TranslationWorkspaceRepository(db);

  return {
    listProjects() {
      return projectRepository.listLibraryProjects();
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

    getProjectDictionary(projectId) {
      return dictionaryRepository.getProjectDictionary(projectId);
    },

    getChapterForTranslation(chapterId) {
      return translationWorkspaceRepository.getChapterForTranslation(chapterId);
    },

    updateFinalTranslation(textUnitId, text) {
      return translationWorkspaceRepository.updateFinalTranslation(textUnitId, text);
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
  };
}

module.exports = {
  createAppApi,
};
