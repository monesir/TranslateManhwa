const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("floris", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});

contextBridge.exposeInMainWorld("florisApi", {
  listProjects: invoke("data:listProjects"),
  createProject: invoke("data:createProject"),
  getLibraryStats: invoke("data:getLibraryStats"),
  getProjectOverview: invoke("data:getProjectOverview"),
  listProjectChapters: invoke("data:listProjectChapters"),
  createProjectChapter: invoke("data:createProjectChapter"),
  pickChapterImages: invoke("data:pickChapterImages"),
  getProjectDictionary: invoke("data:getProjectDictionary"),
  getChapterForTranslation: invoke("data:getChapterForTranslation"),
  prepareLibraryChapter: invoke("data:prepareLibraryChapter"),
  listOcrProviders: invoke("ocr:listProviders"),
  runOcrForPage: invoke("ocr:runPage"),
  runOcrForRegion: invoke("ocr:runRegion"),
  runOcrForChapter: invoke("ocr:runChapter"),
  updateTextUnitSource: invoke("ocr:updateTextUnitSource"),
  updateFinalTranslation: invoke("data:updateFinalTranslation"),
  deleteTextUnit: invoke("data:deleteTextUnit"),
  updateTextUnitTypesetting: invoke("data:updateTextUnitTypesetting"),
  updateChapterTextSize: invoke("data:updateChapterTextSize"),
  addPageEditMark: invoke("data:addPageEditMark"),
  deletePageEditMark: invoke("data:deletePageEditMark"),
  addCharacter: invoke("data:addCharacter"),
  updateCharacter: invoke("data:updateCharacter"),
  deleteCharacter: invoke("data:deleteCharacter"),
  addCharacterAlias: invoke("data:addCharacterAlias"),
  addGlossaryTerm: invoke("data:addGlossaryTerm"),
  updateGlossaryTerm: invoke("data:updateGlossaryTerm"),
  deleteGlossaryTerm: invoke("data:deleteGlossaryTerm"),
  listSourceCatalog: invoke("sources:listCatalog"),
  browseSourceTitles: invoke("sources:browse"),
  searchSourceTitles: invoke("sources:search"),
  getSourceTitleDetails: invoke("sources:getTitleDetails"),
  getSourceChapterPages: invoke("sources:getChapterPages"),
  ensureSourceProject: invoke("sources:ensureProject"),
  prepareSourceChapter: invoke("sources:prepareChapter"),
});
