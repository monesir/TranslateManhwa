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
    "data:addCharacterAlias": (_event, characterId, input) =>
      appApi.addCharacterAlias(characterId, input),
    "data:addGlossaryCategory": (_event, projectId, name) =>
      appApi.addGlossaryCategory(projectId, name),
    "data:addGlossaryTerm": (_event, projectId, input) =>
      appApi.addGlossaryTerm(projectId, input),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = {
  registerIpcHandlers,
};
