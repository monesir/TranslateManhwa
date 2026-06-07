const { ProjectRepository } = require("../data/repositories/project-repository.cjs");
const { ChapterRepository } = require("../data/repositories/chapter-repository.cjs");
const { DictionaryRepository } = require("../data/repositories/dictionary-repository.cjs");
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

    addCharacterAlias(characterId, input) {
      return dictionaryRepository.addCharacterAlias(characterId, input);
    },

    addGlossaryCategory(projectId, name) {
      return dictionaryRepository.addGlossaryCategory(projectId, name);
    },

    addGlossaryTerm(projectId, input) {
      return dictionaryRepository.addGlossaryTerm(projectId, input);
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
  };
}

module.exports = {
  createAppApi,
};
