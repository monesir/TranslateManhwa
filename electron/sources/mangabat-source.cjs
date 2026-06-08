const {
  MANGABAT_SOURCE_METADATA,
  MANGABAT_SOURCE_RECORD,
} = require("./source-contracts.cjs");
const {
  emptyPageResult,
  fetchCheerio,
  parseTitleStatus,
  trimText,
} = require("./source-helpers.cjs");

const BASE_URL = "https://www.mangabats.com";
const CHAPTERS_PAGE_LIMIT = 500;

const MANGABAT_JSON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  Referer: `${BASE_URL}/`,
  "X-Requested-With": "XMLHttpRequest",
};

function slugFromUrl(url) {
  const parts = String(url).replace(/\/$/, "").split("/");
  const raw = parts[parts.length - 1] || url;
  return raw.replace(/[\u2018\u2019\u0060\u00B4']/g, "");
}

function searchAlias(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[!@%^*()+=<>\?/,\.:;' "\&#\[\]~\-\$_]+/g, "_")
    .replace(/_+_/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchScore(item, query) {
  const name = normalizedSearchText(item.name);
  const normalizedQuery = normalizedSearchText(query);
  if (!name || !normalizedQuery) return 50;
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.split(" ").includes(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 3;
  return 10;
}

function mapAutocompleteItem(item) {
  const url = String(item?.url ?? "");
  const slug = String(item?.slug ?? "").trim() || slugFromUrl(url);
  const name = trimText(item?.name);
  if (!slug || !name) return null;

  return {
    titleId: slug,
    slug,
    name,
    coverUrl: item?.thumb || `https://img-r1.2xstorage.com/thumb/${slug}.webp`,
    bannerUrl: null,
    canonicalUrl: url || `${BASE_URL}/manga/${slug}`,
    status: "unknown",
    statusLabel: null,
    tags: [],
    latestChapterLabel: trimText(item?.chapterLatest) || null,
    descriptionSnippet: trimText(item?.author) || null,
  };
}

async function browse(page = 1) {
  const numericPage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const url = `${BASE_URL}/manga-list/latest-manga?page=${numericPage}`;
  const $ = await fetchCheerio(url);

  const items = $("a.list-story-item");
  if (items.length === 0) return emptyPageResult(numericPage);

  const results = [];

  items.each((_i, el) => {
    const anchor = $(el);
    const href = anchor.attr("href") || "";
    const title = anchor.attr("title") || trimText(anchor.text());
    if (!href || !title) return;

    const slug = slugFromUrl(href);
    const img = anchor.find("img").first();

    results.push({
      titleId: slug,
      slug,
      name: title,
      coverUrl: img.attr("src") || img.attr("data-src") || `https://img-r1.2xstorage.com/thumb/${slug}.webp`,
      bannerUrl: null,
      canonicalUrl: `${BASE_URL}/manga/${slug}`,
      status: "unknown",
      statusLabel: null,
      tags: [],
      latestChapterLabel: null,
      descriptionSnippet: null,
    });
  });

  const nextPageLink = $(".group_page a").filter((_i, el) => $(el).text().trim() === String(numericPage + 1));

  return {
    items: results,
    page: numericPage,
    hasNextPage: nextPageLink.length > 0 || results.length >= 20,
  };
}

async function search(query, page = 1) {
  const rawQuery = String(query ?? "").trim();
  const normalizedQuery = rawQuery.toLowerCase();
  const numericPage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;

  if (!normalizedQuery) return emptyPageResult(numericPage);

  try {
    const autocompleteUrl = new URL("/home/search/json", BASE_URL);
    autocompleteUrl.searchParams.set("searchword", searchAlias(rawQuery));
    const autocompleteResponse = await fetch(autocompleteUrl, { headers: MANGABAT_JSON_HEADERS });

    if (!autocompleteResponse.ok) {
      throw new Error(`MangaBat autocomplete search failed: ${autocompleteResponse.status}`);
    }

    const data = await autocompleteResponse.json();
    const autocompleteResults = (Array.isArray(data) ? data : [])
      .map(mapAutocompleteItem)
      .filter(Boolean)
      .sort((first, second) => searchScore(first, rawQuery) - searchScore(second, rawQuery));

    if (autocompleteResults.length > 0) {
      return {
        items: numericPage === 1 ? autocompleteResults : [],
        page: numericPage,
        hasNextPage: false,
      };
    }
  } catch {
    // Fall back to the public search page below; it is sometimes blocked by Cloudflare.
  }

  try {
    const searchUrl = `${BASE_URL}/search/story/${encodeURIComponent(normalizedQuery)}?page=${numericPage}`;
    const $ = await fetchCheerio(searchUrl);

    const pageTitle = $("title").text().trim();
    if (pageTitle.includes("moment") || pageTitle.includes("404")) {
      throw new Error("MangaBat search is unavailable");
    }

    const items = $("a.list-story-item");
    if (items.length === 0) return emptyPageResult(numericPage);

    const results = [];

    items.each((_i, el) => {
      const anchor = $(el);
      const href = anchor.attr("href") || "";
      const title = anchor.attr("title") || trimText(anchor.text());
      if (!href || !title) return;

      const slug = slugFromUrl(href);
      const img = anchor.find("img").first();

      results.push({
        titleId: slug,
        slug,
        name: title,
        coverUrl: img.attr("src") || img.attr("data-src") || null,
        bannerUrl: null,
        canonicalUrl: `${BASE_URL}/manga/${slug}`,
        status: "unknown",
        statusLabel: null,
        tags: [],
        latestChapterLabel: null,
        descriptionSnippet: null,
      });
    });

    const nextPageLink = $(".group_page a").filter((_i, el) => $(el).text().trim() === String(numericPage + 1));

    return {
      items: results,
      page: numericPage,
      hasNextPage: nextPageLink.length > 0,
    };
  } catch {
    const browsePages = await Promise.all([1, 2, 3].map((fallbackPage) => browse(fallbackPage).catch(() => null)));
    const filtered = browsePages
      .flatMap((result) => result?.items ?? [])
      .filter((item) => normalizedSearchText(item.name).includes(normalizedSearchText(rawQuery)))
      .sort((first, second) => searchScore(first, rawQuery) - searchScore(second, rawQuery));
    return {
      items: numericPage === 1 ? filtered : [],
      page: numericPage,
      hasNextPage: false,
    };
  }
}

async function getTitleDetails(titleId) {
  const normalizedTitleId = String(titleId ?? "").trim();
  const url = `${BASE_URL}/manga/${encodeURIComponent(normalizedTitleId)}`;
  const $ = await fetchCheerio(url);

  const name = trimText($("h1").first().text()) || normalizedTitleId;
  const coverImg = $(".info-image img, .manga-info-pic img, .story-info-left img").first();
  const coverUrl =
    coverImg.attr("src") ||
    coverImg.attr("data-src") ||
    `https://img-r1.2xstorage.com/thumb/${normalizedTitleId}.webp`;

  let authors = [];
  let artists = [];
  let statusRaw = "";
  const tags = [];

  $("table.variations-tableInfo tr").each((_i, el) => {
    const label = trimText($(el).find("td").first().text()).toLowerCase();
    const valueTd = $(el).find("td").last();
    const value = trimText(valueTd.text());

    if (label.includes("author")) {
      authors = value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    } else if (label.includes("artist")) {
      artists = value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    } else if (label.includes("status")) {
      statusRaw = value;
    } else if (label.includes("genre")) {
      valueTd.find("a").each((_j, link) => {
        const tag = trimText($(link).text());
        if (tag) tags.push(tag);
      });
    }
  });

  let description = null;
  const descEl = $("[id*=description], .panel-story-info-description").first();
  if (descEl.length) {
    const rawDesc = trimText(descEl.text());
    const cleaned = rawDesc.replace(/^Description\s*:\s*/i, "").trim();
    description = cleaned || null;
  }

  if (authors.length === 0) authors = ["Unknown"];

  return {
    titleId: normalizedTitleId,
    slug: normalizedTitleId,
    name,
    coverUrl,
    bannerUrl: null,
    canonicalUrl: `${BASE_URL}/manga/${normalizedTitleId}`,
    status: parseTitleStatus(statusRaw),
    statusLabel: statusRaw || null,
    tags: tags.slice(0, 15),
    latestChapterLabel: null,
    descriptionSnippet: description ? description.substring(0, 200) : null,
    description,
    authors,
    artists,
    originalLanguage: null,
    sourceLabel: MANGABAT_SOURCE_METADATA.displayName,
  };
}

async function listChapters(titleId) {
  const normalizedTitleId = String(titleId ?? "").trim();
  const chapters = [];
  const seen = new Set();
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`/api/manga/${encodeURIComponent(normalizedTitleId)}/chapters`, BASE_URL);
    url.searchParams.set("limit", String(CHAPTERS_PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, { headers: MANGABAT_JSON_HEADERS });

    if (!response.ok) {
      throw new Error(`MangaBat chapters fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const pageChapters = Array.isArray(data?.data?.chapters) ? data.data.chapters : [];

    for (const chapter of pageChapters) {
      const chapterId = chapter.chapter_slug || String(chapter.chapter_num);
      if (!chapterId || seen.has(chapterId)) continue;
      seen.add(chapterId);
      chapters.push({
        chapterId,
        title: chapter.chapter_name || `Chapter ${chapter.chapter_num ?? "?"}`,
        chapterNumber: chapter.chapter_num ?? null,
        volumeNumber: null,
        groupName: null,
        releaseDate: chapter.updated_at || null,
        canonicalUrl: `${BASE_URL}/manga/${normalizedTitleId}/${chapterId}`,
        availability: "readable",
        availabilityLabel: "Readable",
      });
    }

    const pagination = data?.data?.pagination ?? {};
    const total = Number(pagination.total ?? 0);
    const pageLimit = Number(pagination.limit ?? CHAPTERS_PAGE_LIMIT);
    const pageOffset = Number(pagination.offset ?? offset);
    const nextOffset = pageOffset + Math.max(pageChapters.length, pageLimit);
    hasMore = Boolean(pagination.has_more) && pageChapters.length > 0 && nextOffset < total;
    offset = nextOffset;
  }

  return chapters;
}

async function getChapterPages(titleId, chapterId) {
  const url = `${BASE_URL}/manga/${encodeURIComponent(String(titleId))}/${encodeURIComponent(String(chapterId))}`;
  const $ = await fetchCheerio(url);
  const pages = [];

  $(".container-chapter-reader img").each((index, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && src.startsWith("http")) {
      pages.push({
        pageIndex: index,
        imageUrl: src.trim(),
      });
    }
  });

  return pages;
}

const mangabatSourceRuntime = {
  metadata: MANGABAT_SOURCE_METADATA,
  capabilities: MANGABAT_SOURCE_RECORD.capabilities,
  browse,
  search,
  getTitleDetails,
  listChapters,
  getChapterPages,
};

module.exports = {
  mangabatSourceRuntime,
};
