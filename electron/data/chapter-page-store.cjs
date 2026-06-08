const fs = require("node:fs/promises");
const path = require("node:path");
const {
  COVER_CACHE_SCHEME,
  IMAGE_HEADERS,
  extensionFromContentType,
  extensionFromUrl,
  mimeTypeFromExtension,
  sanitizeFilePart,
} = require("./cover-cache.cjs");

const PAGE_CACHE_HOST = "pages";
const PAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
const KNOWN_IMAGE_EXTENSIONS = [".webp", ".jpg", ".png", ".gif", ".avif"];

function encodePathParts(parts) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function pageCacheUrl(relativePath) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  return `${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/${encodePathParts(parts)}`;
}

async function statFirstExisting(directory, baseName, preferredExtension) {
  const extensions = [
    preferredExtension,
    ...KNOWN_IMAGE_EXTENSIONS.filter((extension) => extension !== preferredExtension),
  ].filter(Boolean);

  for (const extension of extensions) {
    const fileName = `${baseName}${extension}`;
    const filePath = path.join(directory, fileName);
    try {
      const stats = await fs.stat(filePath);
      return {
        extension,
        fileName,
        filePath,
        stats,
      };
    } catch {
      // Cache miss for this extension; try the next known image extension.
    }
  }

  return null;
}

async function downloadImage(sourceUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_DOWNLOAD_TIMEOUT_MS);
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
    throw new Error(`Page download failed: ${response.status}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
  };
}

class ChapterPageStore {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
  }

  chapterPagesPath(projectId, chapterId) {
    return path.join(
      this.workspacePath,
      "projects",
      sanitizeFilePart(projectId),
      "chapters",
      sanitizeFilePart(chapterId),
      "pages",
    );
  }

  async savePage({ assetId, chapterId, pageIndex, projectId, sourceUrl }) {
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      throw new Error("Chapter page download requires an HTTP image URL");
    }

    const directory = this.chapterPagesPath(projectId, chapterId);
    const pageNumber = String(pageIndex).padStart(4, "0");
    const baseName = `page-${pageNumber}`;
    const sourceExtension = extensionFromUrl(sourceUrl);
    const existing = await statFirstExisting(directory, baseName, sourceExtension);

    if (existing) {
      const relativePath = path
        .join(
          "projects",
          sanitizeFilePart(projectId),
          "chapters",
          sanitizeFilePart(chapterId),
          "pages",
          existing.fileName,
        )
        .replace(/\\/g, "/");

      return {
        assetId,
        cacheUrl: pageCacheUrl(relativePath),
        filePath: existing.filePath,
        mimeType: mimeTypeFromExtension(existing.extension),
        relativePath,
        reused: true,
        sizeBytes: existing.stats.size,
      };
    }

    const downloaded = await downloadImage(sourceUrl);
    const extension =
      extensionFromContentType(downloaded.contentType) || sourceExtension || ".img";
    const fileName = `${baseName}${extension}`;
    const filePath = path.join(directory, fileName);
    const tempPath = `${filePath}.tmp`;
    const relativePath = path
      .join(
        "projects",
        sanitizeFilePart(projectId),
        "chapters",
        sanitizeFilePart(chapterId),
        "pages",
        fileName,
      )
      .replace(/\\/g, "/");

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(tempPath, downloaded.bytes);
    await fs.rename(tempPath, filePath);

    return {
      assetId,
      cacheUrl: pageCacheUrl(relativePath),
      filePath,
      mimeType: downloaded.contentType || mimeTypeFromExtension(extension),
      relativePath,
      reused: false,
      sizeBytes: downloaded.bytes.length,
    };
  }
}

module.exports = {
  ChapterPageStore,
  PAGE_CACHE_HOST,
};
