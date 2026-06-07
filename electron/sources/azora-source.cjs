const {
  AZORA_SOURCE_METADATA,
  AZORA_SOURCE_RECORD,
} = require("./source-contracts.cjs");
const { fetchJson } = require("./http-client.cjs");
const {
  emptyPageResult,
  normalizePage,
  normalizeSeriesType,
  normalizeStatus,
  stripHtml,
} = require("./source-helpers.cjs");

const API_BASE_URL = "https://api.azoramoon.com/api";
const PAGE_SIZE = 20;

function mapChapterAvailability(chapter) {
  if (chapter.isPermanentlyLocked || chapter.isLockedByCoins || Number(chapter.price ?? 0) > 0) {
    return {
      availability: "locked",
      availabilityLabel: "Locked",
    };
  }

  if (chapter.chapterStatus && chapter.chapterStatus !== "PUBLIC") {
    return {
      availability: "unavailable",
      availabilityLabel: String(chapter.chapterStatus),
    };
  }

  return {
    availability: "readable",
    availabilityLabel: "Readable",
  };
}

function mapPostSummary(post) {
  return {
    titleId: String(post.slug),
    slug: String(post.slug),
    name: post.postTitle ?? String(post.slug),
    coverUrl: post.featuredImage ?? null,
    bannerUrl: post.featuredImage ?? null,
    canonicalUrl: `https://azoramoon.com/series/${post.slug}`,
    status: "unknown",
    statusLabel: post.seriesStatus ?? null,
    tags: [],
    latestChapterLabel: null,
    descriptionSnippet: stripHtml(post.postDescription),
  };
}

async function browse(page = 1) {
  const normalizedPage = normalizePage(page);
  const url =
    `${API_BASE_URL}/query?page=${normalizedPage}&perPage=${PAGE_SIZE}` +
    "&searchTerm=&orderBy=lastChapterAddedAt&orderDirection=desc";
  const data = await fetchJson(url, { sourceName: "Azora" });

  if (!Array.isArray(data?.posts) || data.posts.length === 0) {
    return emptyPageResult(normalizedPage);
  }

  return {
    items: data.posts.map(mapPostSummary),
    page: normalizedPage,
    hasNextPage: data.posts.length === PAGE_SIZE,
  };
}

async function search(query, page = 1) {
  const normalizedPage = normalizePage(page);
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return emptyPageResult(normalizedPage);
  }

  const url =
    `${API_BASE_URL}/query?page=${normalizedPage}&perPage=${PAGE_SIZE}` +
    `&searchTerm=${encodeURIComponent(normalizedQuery)}` +
    "&orderBy=lastChapterAddedAt&orderDirection=desc";
  const data = await fetchJson(url, { sourceName: "Azora" });

  if (!Array.isArray(data?.posts) || data.posts.length === 0) {
    return emptyPageResult(normalizedPage);
  }

  return {
    items: data.posts.map(mapPostSummary),
    page: normalizedPage,
    hasNextPage: data.posts.length === PAGE_SIZE,
  };
}

async function getTitleDetails(titleId) {
  const normalizedTitleId = String(titleId ?? "").trim();
  const data = await fetchJson(
    `${API_BASE_URL}/post?postSlug=${encodeURIComponent(normalizedTitleId)}`,
    { sourceName: "Azora" },
  );

  if (!data?.post) {
    throw new Error("Azora series not found");
  }

  const post = data.post;
  const status = normalizeStatus(post.seriesStatus);
  const description = stripHtml(post.postContent) ?? stripHtml(post.postDescription);
  const tags = Array.isArray(post.genres)
    ? post.genres.map((genre) => genre?.name).filter(Boolean)
    : [];
  const authors = [post.author, post.studio, post.publishingTeam?.name].filter(Boolean);

  return {
    titleId: normalizedTitleId,
    slug: normalizedTitleId,
    name: post.postTitle ?? normalizedTitleId,
    coverUrl: post.featuredImage ?? null,
    bannerUrl: post.featuredImage ?? null,
    canonicalUrl: `https://azoramoon.com/series/${normalizedTitleId}`,
    status: status.status,
    statusLabel: status.statusLabel,
    tags: tags.slice(0, 10),
    latestChapterLabel: null,
    descriptionSnippet: description,
    description,
    authors: authors.length > 0 ? authors : ["Unknown"],
    artists: post.artist ? [post.artist] : [],
    originalLanguage: normalizeSeriesType(post.seriesType),
    sourceLabel: AZORA_SOURCE_METADATA.displayName,
  };
}

async function listChapters(titleId) {
  const normalizedTitleId = String(titleId ?? "").trim();
  const data = await fetchJson(
    `${API_BASE_URL}/post?postSlug=${encodeURIComponent(normalizedTitleId)}`,
    { sourceName: "Azora" },
  );

  if (!Array.isArray(data?.post?.chapters)) {
    return [];
  }

  return data.post.chapters
    .map((chapter) => {
      const chapterNumber = Number.isFinite(Number(chapter.number))
        ? Number(chapter.number)
        : null;
      const availability = mapChapterAvailability(chapter);
      return {
        chapterId: String(chapter.id),
        title: chapter.title || `Chapter ${chapterNumber ?? "?"}`,
        chapterNumber,
        volumeNumber: null,
        groupName: null,
        releaseDate: chapter.createdAt ?? null,
        canonicalUrl:
          chapterNumber == null
            ? `https://azoramoon.com/series/${normalizedTitleId}`
            : `https://azoramoon.com/series/${normalizedTitleId}/chapter-${chapterNumber}`,
        availability: availability.availability,
        availabilityLabel: availability.availabilityLabel,
      };
    })
    .sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0));
}

async function getChapterPages(_titleId, chapterId) {
  const data = await fetchJson(
    `${API_BASE_URL}/chapter?chapterId=${encodeURIComponent(String(chapterId))}`,
    { sourceName: "Azora" },
  );

  if (!Array.isArray(data?.chapter?.images)) {
    return [];
  }

  return data.chapter.images
    .map((image, index) => ({
      pageIndex: index,
      imageUrl: typeof image === "string" ? image : image?.url,
    }))
    .filter((page) => Boolean(page.imageUrl));
}

const azoraSourceRuntime = {
  metadata: AZORA_SOURCE_METADATA,
  capabilities: AZORA_SOURCE_RECORD.capabilities,
  browse,
  search,
  getTitleDetails,
  listChapters,
  getChapterPages,
};

module.exports = {
  azoraSourceRuntime,
};
