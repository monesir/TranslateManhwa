const BUILT_IN_PLUGIN_ID = "core.builtin";

const EMPTY_SOURCE_CAPABILITIES = {
  browse: false,
  search: false,
  title_details: false,
  chapter_list: false,
  chapter_pages: false,
  downloads: false,
};

function createCapabilities(overrides) {
  return {
    ...EMPTY_SOURCE_CAPABILITIES,
    ...overrides,
  };
}

function deriveTitleActions(capabilities) {
  return {
    canBrowse: Boolean(capabilities.browse),
    canSearch: Boolean(capabilities.search),
    canViewTitle: Boolean(capabilities.title_details),
    canReadChapters: Boolean(capabilities.chapter_list && capabilities.chapter_pages),
    canDownload: Boolean(capabilities.downloads),
  };
}

const AZORA_SOURCE_ID = "azora.series";
const MANGASWAT_SOURCE_ID = "mangaswat.series";

const AZORA_SOURCE_METADATA = {
  pluginId: BUILT_IN_PLUGIN_ID,
  sourceId: AZORA_SOURCE_ID,
  displayName: "Azora Manga",
  language: "ar",
  baseUrl: "https://azoramoon.com",
};

const MANGASWAT_SOURCE_METADATA = {
  pluginId: BUILT_IN_PLUGIN_ID,
  sourceId: MANGASWAT_SOURCE_ID,
  displayName: "MangaSwat",
  language: "ar",
  baseUrl: "https://meshmanga.com",
};

const SOURCE_READER_CAPABILITIES = createCapabilities({
  browse: true,
  search: true,
  title_details: true,
  chapter_list: true,
  chapter_pages: true,
  downloads: false,
});

const AZORA_SOURCE_RECORD = {
  ...AZORA_SOURCE_METADATA,
  capabilities: SOURCE_READER_CAPABILITIES,
};

const MANGASWAT_SOURCE_RECORD = {
  ...MANGASWAT_SOURCE_METADATA,
  capabilities: SOURCE_READER_CAPABILITIES,
};

module.exports = {
  AZORA_SOURCE_ID,
  AZORA_SOURCE_METADATA,
  AZORA_SOURCE_RECORD,
  BUILT_IN_PLUGIN_ID,
  EMPTY_SOURCE_CAPABILITIES,
  MANGASWAT_SOURCE_ID,
  MANGASWAT_SOURCE_METADATA,
  MANGASWAT_SOURCE_RECORD,
  createCapabilities,
  deriveTitleActions,
};
