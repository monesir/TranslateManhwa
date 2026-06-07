function emptyPageResult(page) {
  return {
    items: [],
    page,
    hasNextPage: false,
  };
}

async function fetchHtml(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9,ar;q=0.8",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchCheerio(url, init = {}) {
  const { load } = require("cheerio");
  const html = await fetchHtml(url, init);
  return load(html);
}

function parseTitleStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) return "unknown";
  if (/(ongoing|active|publishing)/.test(normalized)) return "ongoing";
  if (/(completed|complete|finished)/.test(normalized)) return "completed";
  if (/(hiatus|paused)/.test(normalized)) return "hiatus";
  if (/(cancelled|canceled|dropped)/.test(normalized)) return "cancelled";

  return "unknown";
}

function trimText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  if (!value) return null;
  const stripped = String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}

function normalizePage(page) {
  const numericPage = Number(page);
  return Number.isFinite(numericPage) && numericPage > 0 ? Math.floor(numericPage) : 1;
}

function normalizeSeriesType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized.includes("manhwa")) return "Korean (Manhwa)";
  if (normalized.includes("manhua")) return "Chinese (Manhua)";
  if (normalized.includes("manga")) return "Japanese (Manga)";

  return null;
}

function normalizeStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["ongoing", "active", "publishing"].includes(normalized)) {
    return { status: "ongoing", statusLabel: "Ongoing" };
  }

  if (["completed", "complete", "finished"].includes(normalized)) {
    return { status: "completed", statusLabel: "Completed" };
  }

  if (["hiatus", "paused"].includes(normalized)) {
    return { status: "hiatus", statusLabel: "Hiatus" };
  }

  if (["dropped", "cancelled", "canceled"].includes(normalized)) {
    return { status: "cancelled", statusLabel: "Cancelled" };
  }

  return {
    status: "unknown",
    statusLabel: value ? String(value) : null,
  };
}

function getFirstName(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value.name === "string") return value.name.trim() || null;
  return null;
}

function parseChapterNumber(value) {
  if (value == null) return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  emptyPageResult,
  fetchCheerio,
  fetchHtml,
  getFirstName,
  normalizePage,
  normalizeSeriesType,
  normalizeStatus,
  parseChapterNumber,
  parseTitleStatus,
  sleep,
  stripHtml,
  trimText,
};
