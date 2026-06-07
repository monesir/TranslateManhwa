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
  getLibraryStats: invoke("data:getLibraryStats"),
  getProjectOverview: invoke("data:getProjectOverview"),
  listProjectChapters: invoke("data:listProjectChapters"),
  getProjectDictionary: invoke("data:getProjectDictionary"),
  getChapterForTranslation: invoke("data:getChapterForTranslation"),
  updateFinalTranslation: invoke("data:updateFinalTranslation"),
  addCharacter: invoke("data:addCharacter"),
  addCharacterAlias: invoke("data:addCharacterAlias"),
  addGlossaryCategory: invoke("data:addGlossaryCategory"),
  addGlossaryTerm: invoke("data:addGlossaryTerm"),
  listSourceCatalog: invoke("sources:listCatalog"),
  browseSourceTitles: invoke("sources:browse"),
  searchSourceTitles: invoke("sources:search"),
  getSourceTitleDetails: invoke("sources:getTitleDetails"),
  getSourceChapterPages: invoke("sources:getChapterPages"),
});
