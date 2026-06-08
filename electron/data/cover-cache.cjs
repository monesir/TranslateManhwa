const fs = require("node:fs/promises");
const path = require("node:path");

const COVER_CACHE_SCHEME = "floris-cache";
const COVER_CACHE_HOST = "covers";
const COVER_CACHE_TIMEOUT_MS = 10_000;

const IMAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  Referer: "https://www.mangabats.com/",
};

function sanitizeFilePart(value) {
  return String(value ?? "cover")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150) || "cover";
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType ?? "").toLowerCase();
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return ".jpg";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/avif")) return ".avif";
  return "";
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const extension = path.extname(pathname);
    if ([".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif"].includes(extension)) {
      return extension === ".jpeg" ? ".jpg" : extension;
    }
  } catch {
    return "";
  }
  return "";
}

function mimeTypeFromExtension(extension) {
  switch (extension) {
    case ".webp":
      return "image/webp";
    case ".jpg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return null;
  }
}

function coverCacheUrl(fileName) {
  return `${COVER_CACHE_SCHEME}://${COVER_CACHE_HOST}/${encodeURIComponent(fileName)}`;
}

class CoverCache {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.coversPath = path.join(workspacePath, "cache", "covers");
  }

  async cacheCover({ assetId, projectId, sourceUrl }) {
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      throw new Error("Cover cache requires an HTTP image URL");
    }

    const urlExtension = extensionFromUrl(sourceUrl);
    const baseFileName = `${sanitizeFilePart(projectId)}_${sanitizeFilePart(assetId)}`;

    if (urlExtension) {
      const cachedFileName = `${baseFileName}${urlExtension}`;
      const cachedFilePath = path.join(this.coversPath, cachedFileName);
      try {
        const stats = await fs.stat(cachedFilePath);
        return {
          cacheUrl: coverCacheUrl(cachedFileName),
          relativePath: path.join("cache", "covers", cachedFileName).replace(/\\/g, "/"),
          filePath: cachedFilePath,
          mimeType: mimeTypeFromExtension(urlExtension),
          sizeBytes: stats.size,
          reused: true,
        };
      } catch {
        // Cache miss; download the source image below.
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COVER_CACHE_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(sourceUrl, {
        headers: IMAGE_HEADERS,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Cover download failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const extension = extensionFromContentType(contentType) || urlExtension || ".img";
    const fileName = `${baseFileName}${extension}`;
    const filePath = path.join(this.coversPath, fileName);
    const tempPath = `${filePath}.tmp`;
    const bytes = Buffer.from(await response.arrayBuffer());

    await fs.mkdir(this.coversPath, { recursive: true });
    await fs.writeFile(tempPath, bytes);
    await fs.rename(tempPath, filePath);

    return {
      cacheUrl: coverCacheUrl(fileName),
      relativePath: path.join("cache", "covers", fileName).replace(/\\/g, "/"),
      filePath,
      mimeType: contentType || null,
      sizeBytes: bytes.length,
      reused: false,
    };
  }
}

module.exports = {
  COVER_CACHE_HOST,
  COVER_CACHE_SCHEME,
  CoverCache,
  IMAGE_HEADERS,
  extensionFromContentType,
  extensionFromUrl,
  mimeTypeFromExtension,
  sanitizeFilePart,
};
