function emptyPageResult(page) {
  return {
    items: [],
    page,
    hasNextPage: false,
  };
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
  getFirstName,
  normalizePage,
  normalizeSeriesType,
  normalizeStatus,
  parseChapterNumber,
  sleep,
  stripHtml,
};
