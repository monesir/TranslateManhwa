const { dialog, ipcMain } = require("electron");

function registerIpcHandlers(appApi) {
  const handlers = {
    "data:listProjects": () => appApi.listProjects(),
    "data:createProject": (_event, input) => appApi.createProject(input),
    "data:getLibraryStats": () => appApi.getLibraryStats(),
    "data:getProjectOverview": (_event, projectId) => appApi.getProjectOverview(projectId),
    "data:listProjectChapters": (_event, projectId) => appApi.listProjectChapters(projectId),
    "data:createProjectChapter": (_event, projectId, input) =>
      appApi.createProjectChapter(projectId, input),
    "data:pickChapterImages": async () => {
      const result = await dialog.showOpenDialog({
        title: "Choose chapter page images",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Images",
            extensions: ["avif", "gif", "jpeg", "jpg", "png", "webp"],
          },
        ],
      });

      return result.canceled ? [] : result.filePaths;
    },
    "data:getProjectDictionary": (_event, projectId) => appApi.getProjectDictionary(projectId),
    "data:getChapterForTranslation": (_event, chapterId) =>
      appApi.getChapterForTranslation(chapterId),
    "data:prepareLibraryChapter": (_event, chapterId) =>
      appApi.prepareLibraryChapter(chapterId),
    "ocr:listProviders": (_event, languageHint) => appApi.listOcrProviders(languageHint),
    "ocr:runPage": (_event, pageId, input) => appApi.runOcrForPage(pageId, input),
    "ocr:runRegion": (_event, pageId, input) => appApi.runOcrForRegion(pageId, input),
    "ocr:runChapter": (_event, chapterId, input) =>
      appApi.runOcrForChapter(chapterId, input),
    "ocr:updateTextUnitSource": (_event, textUnitId, input) =>
      appApi.updateTextUnitSource(textUnitId, input),
    "ocr:deleteResults": (_event, input) =>
      appApi.deleteOcrResults(input),
    "data:updateFinalTranslation": (_event, textUnitId, text) =>
      appApi.updateFinalTranslation(textUnitId, text),
    "data:deleteTextUnit": (_event, textUnitId) =>
      appApi.deleteTextUnit(textUnitId),
    "data:updateTextUnitTypesetting": (_event, textUnitId, input) =>
      appApi.updateTextUnitTypesetting(textUnitId, input),
    "data:updateChapterTextSize": (_event, chapterId, input) =>
      appApi.updateChapterTextSize(chapterId, input),
    "data:addPageEditMark": (_event, input) =>
      appApi.addPageEditMark(input),
    "data:deletePageEditMark": (_event, markId) =>
      appApi.deletePageEditMark(markId),
    "data:samplePageColor": (_event, pageId, input) =>
      appApi.samplePageColor(pageId, input),
    "data:cleanPageText": (_event, pageId, input) =>
      appApi.cleanPageText(pageId, input),
    "data:restoreCleanPatchArea": (_event, markId, input) =>
      appApi.restoreCleanPatchArea(markId, input),
    "translation:microsoft": (_event, input) =>
      appApi.translateWithMicrosoft(input),
    "pages:mergeChapter": (_event, chapterId, input) =>
      appApi.mergeChapterPages(chapterId, input),
    "pages:removeMerged": (_event, chapterId) =>
      appApi.removeMergedPages(chapterId),
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
    "sources:ensureProject": (_event, sourceId, titleId) =>
      appApi.ensureSourceProject(sourceId, titleId),
    "sources:prepareChapter": (_event, sourceId, titleId, chapterId) =>
      appApi.prepareSourceChapter(sourceId, titleId, chapterId),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = {
  registerIpcHandlers,
};
