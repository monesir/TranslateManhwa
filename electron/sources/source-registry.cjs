const { azoraSourceRuntime } = require("./azora-source.cjs");
const { mangaswatSourceRuntime } = require("./mangaswat-source.cjs");
const { deriveTitleActions } = require("./source-contracts.cjs");

const builtInSourceRuntimes = [
  azoraSourceRuntime,
  mangaswatSourceRuntime,
];

function getActiveSourceRuntimes() {
  return builtInSourceRuntimes;
}

function getRuntimeRecord(sourceId) {
  return getActiveSourceRuntimes().find((source) => source.metadata.sourceId === sourceId) ?? null;
}

function listSourceCatalog() {
  return getActiveSourceRuntimes().map((source) => ({
    metadata: source.metadata,
    capabilities: source.capabilities,
    actions: deriveTitleActions(source.capabilities),
  }));
}

async function browseSourceTitles(sourceId, page = 1) {
  const source = getRuntimeRecord(sourceId);

  if (!source?.browse) {
    throw new Error(`Source ${sourceId} does not support browse`);
  }

  return source.browse(page);
}

async function searchSourceTitles(sourceId, query, page = 1) {
  const source = getRuntimeRecord(sourceId);

  if (!source?.search) {
    throw new Error(`Source ${sourceId} does not support search`);
  }

  return source.search(query, page);
}

async function getSourceTitleDetails(sourceId, titleId) {
  const source = getRuntimeRecord(sourceId);

  if (!source?.getTitleDetails) {
    throw new Error(`Source ${sourceId} does not support title details`);
  }

  const details = await source.getTitleDetails(titleId);
  const chapters = source.listChapters ? await source.listChapters(titleId) : [];

  return {
    details,
    chapters,
  };
}

async function getSourceChapterPages(sourceId, titleId, chapterId) {
  const source = getRuntimeRecord(sourceId);

  if (!source?.getChapterPages) {
    throw new Error(`Source ${sourceId} does not support chapter pages`);
  }

  return source.getChapterPages(titleId, chapterId);
}

module.exports = {
  browseSourceTitles,
  getActiveSourceRuntimes,
  getSourceChapterPages,
  getSourceTitleDetails,
  listSourceCatalog,
  searchSourceTitles,
};
