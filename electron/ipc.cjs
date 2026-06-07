const { ipcMain } = require("electron");

function registerIpcHandlers(appApi) {
  const handlers = {
    "data:listProjects": () => appApi.listProjects(),
    "data:getLibraryStats": () => appApi.getLibraryStats(),
    "data:getProjectOverview": (_event, projectId) => appApi.getProjectOverview(projectId),
    "data:listProjectChapters": (_event, projectId) => appApi.listProjectChapters(projectId),
    "data:getProjectDictionary": (_event, projectId) => appApi.getProjectDictionary(projectId),
    "data:getChapterForTranslation": (_event, chapterId) =>
      appApi.getChapterForTranslation(chapterId),
    "data:updateFinalTranslation": (_event, textUnitId, text) =>
      appApi.updateFinalTranslation(textUnitId, text),
    "data:addCharacter": (_event, projectId, input) => appApi.addCharacter(projectId, input),
    "data:updateCharacter": (_event, characterId, input) =>
      appApi.updateCharacter(characterId, input),
    "data:deleteCharacter": (_event, characterId) =>
      appApi.deleteCharacter(characterId),
    "data:addCharacterAlias": (_event, characterId, input) =>
      appApi.addCharacterAlias(characterId, input),
    "data:addGlossaryTerm": (_event, projectId, input) =>
      appApi.addGlossaryTerm(projectId, input),
    "data:updateGlossaryTerm": (_event, termId, input) =>
      appApi.updateGlossaryTerm(termId, input),
    "data:deleteGlossaryTerm": (_event, termId) =>
      appApi.deleteGlossaryTerm(termId),
    "sources:listCatalog": () => appApi.listSourceCatalog(),
    "sources:browse": (_event, sourceId, page) => appApi.browseSourceTitles(sourceId, page),
    "sources:search": (_event, sourceId, query, page) =>
      appApi.searchSourceTitles(sourceId, query, page),
    "sources:getTitleDetails": (_event, sourceId, titleId) =>
      appApi.getSourceTitleDetails(sourceId, titleId),
    "sources:getChapterPages": (_event, sourceId, titleId, chapterId) =>
      appApi.getSourceChapterPages(sourceId, titleId, chapterId),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = {
  registerIpcHandlers,
};
