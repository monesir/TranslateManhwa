const {
  MANGASWAT_SOURCE_METADATA,
  MANGASWAT_SOURCE_RECORD,
} = require("./source-contracts.cjs");
const { fetchJson } = require("./http-client.cjs");
const {
  emptyPageResult,
  getFirstName,
  normalizePage,
  normalizeSeriesType,
  normalizeStatus,
  parseChapterNumber,
  sleep,
  stripHtml,
} = require("./source-helpers.cjs");

const API_BASE_URL = "https://meshmanga.com/v2/api/v2";
const PAGE_SIZE = 20;
const API_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "ktor-client",
};

let lastRequestTime = 0;

async function rateLimitedFetchJson(url) {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < 1000) {
    await sleep(1000 - elapsed);
  }

  lastRequestTime = Date.now();
  return fetchJson(url, {
    headers: API_HEADERS,
    sourceName: "MangaSwat",
  });
}

function mapMangaSummary(item) {
  const tags = Array.isArray(item.genres)
    ? item.genres.map((genre) => genre?.name).filter(Boolean)
    : [];
  const status = normalizeStatus(item.status?.name);
  const numericId = item.serie_id ?? item.id;
  const slug = item.slug ?? String(numericId);

  return {
    titleId: String(numericId),
    slug,
    name: item.title ?? slug,
    coverUrl: item.poster?.thumbnail ?? item.poster?.medium ?? null,
    bannerUrl: item.poster?.medium ?? item.poster?.thumbnail ?? null,
    canonicalUrl: `https://meshmanga.com/series/${slug}`,
    status: status.status,
    statusLabel: status.statusLabel,
    tags,
    latestChapterLabel: null,
    descriptionSnippet: null,
  };
}

async function browse(page = 1) {
  const normalizedPage = normalizePage(page);
  const data = await rateLimitedFetchJson(
    `${API_BASE_URL}/series/releases?page_size=${PAGE_SIZE}&page=${normalizedPage}`,
  );

  if (!Array.isArray(data?.results) || data.results.length === 0) {
    return emptyPageResult(normalizedPage);
  }

  return {
    items: data.results.map(mapMangaSummary),
    page: normalizedPage,
    hasNextPage: Boolean(data.next),
  };
}

async function search(query, page = 1) {
  const normalizedPage = normalizePage(page);
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return emptyPageResult(normalizedPage);
  }

  const data = await rateLimitedFetchJson(
    `${API_BASE_URL}/series/?search=${encodeURIComponent(normalizedQuery)}&page=${normalizedPage}`,
  );

  if (!Array.isArray(data?.results) || data.results.length === 0) {
    return emptyPageResult(normalizedPage);
  }

  return {
    items: data.results.map(mapMangaSummary),
    page: normalizedPage,
    hasNextPage: Boolean(data.next),
  };
}

async function getTitleDetails(titleId) {
  const normalizedTitleId = String(titleId ?? "").trim();
  const data = await rateLimitedFetchJson(`${API_BASE_URL}/series/${normalizedTitleId}`);

  if (!data?.title) {
    throw new Error("MangaSwat series not found");
  }

  const description = stripHtml(data.story);
  const tags = Array.isArray(data.genres)
    ? data.genres.map((genre) => genre?.name).filter(Boolean)
    : [];
  const status = normalizeStatus(data.status?.name);
  const authorName = getFirstName(data.author);
  const artistName = getFirstName(data.artist);
  const slug = data.slug ?? normalizedTitleId;

  return {
    titleId: normalizedTitleId,
    slug,
    name: data.title,
    coverUrl: data.poster?.thumbnail ?? data.poster?.medium ?? null,
    bannerUrl: data.cover?.medium ?? data.poster?.medium ?? null,
    canonicalUrl: `https://meshmanga.com/series/${slug}`,
    status: status.status,
    statusLabel: status.statusLabel,
    tags: tags.slice(0, 10),
    latestChapterLabel: null,
    descriptionSnippet: description,
    description,
    authors: authorName ? [authorName] : ["Unknown"],
    artists: artistName ? [artistName] : [],
    originalLanguage: normalizeSeriesType(data.type?.name),
    sourceLabel: MANGASWAT_SOURCE_METADATA.displayName,
  };
}

async function listChapters(titleId) {
  const chapters = [];
  let url = `${API_BASE_URL}/chapters/?serie=${encodeURIComponent(String(titleId))}&order_by=-order&page_size=200`;

  while (url) {
    const data = await rateLimitedFetchJson(url);
    if (!Array.isArray(data?.results)) break;

    for (const chapter of data.results) {
      const chapterNumber =
        parseChapterNumber(chapter.chapter) ?? parseChapterNumber(chapter.title);

      chapters.push({
        chapterId: String(chapter.id),
        title: chapter.title || `Chapter ${chapterNumber ?? "?"}`,
        chapterNumber,
        volumeNumber: null,
        groupName: null,
        releaseDate: chapter.created_at ?? null,
        canonicalUrl: `https://meshmanga.com/chapter/${chapter.id}`,
        availability: "readable",
        availabilityLabel: "Readable",
      });
    }

    url = data.next || null;
  }

  return chapters;
}

async function getChapterPages(_titleId, chapterId) {
  const data = await rateLimitedFetchJson(
    `${API_BASE_URL}/chapters/${encodeURIComponent(String(chapterId))}`,
  );

  if (!Array.isArray(data?.images)) {
    return [];
  }

  return data.images
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((image, index) => ({
      pageIndex: index,
      imageUrl: image.image,
    }))
    .filter((page) => Boolean(page.imageUrl));
}

const mangaswatSourceRuntime = {
  metadata: MANGASWAT_SOURCE_METADATA,
  capabilities: MANGASWAT_SOURCE_RECORD.capabilities,
  browse,
  search,
  getTitleDetails,
  listChapters,
  getChapterPages,
};

module.exports = {
  mangaswatSourceRuntime,
};
