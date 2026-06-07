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

const MANGABAT_SOURCE_ID = "mangabat.series";

const MANGABAT_SOURCE_METADATA = {
  pluginId: BUILT_IN_PLUGIN_ID,
  sourceId: MANGABAT_SOURCE_ID,
  displayName: "MangaBat",
  language: "en",
  baseUrl: "https://www.mangabats.com",
};

const SOURCE_READER_CAPABILITIES = createCapabilities({
  browse: true,
  search: true,
  title_details: true,
  chapter_list: true,
  chapter_pages: true,
  downloads: false,
});

const MANGABAT_SOURCE_RECORD = {
  ...MANGABAT_SOURCE_METADATA,
  capabilities: SOURCE_READER_CAPABILITIES,
};

module.exports = {
  BUILT_IN_PLUGIN_ID,
  EMPTY_SOURCE_CAPABILITIES,
  MANGABAT_SOURCE_ID,
  MANGABAT_SOURCE_METADATA,
  MANGABAT_SOURCE_RECORD,
  createCapabilities,
  deriveTitleActions,
};
