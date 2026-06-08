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
const KNOWN_IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif"];
const DEFAULT_PAGE_DIMENSIONS = { width: 820, height: 1240 };

function ascii(bytes, start, end) {
  return bytes.toString("ascii", start, end);
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readPngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    ascii(bytes, 1, 4) !== "PNG" ||
    ascii(bytes, 12, 16) !== "IHDR"
  ) {
    return null;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readGifDimensions(bytes) {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "GIF") return null;
  return {
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
}

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && segmentLength >= 7) {
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > bytes.length) break;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: readUInt24LE(bytes, dataStart + 4) + 1,
        height: readUInt24LE(bytes, dataStart + 7) + 1,
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && bytes[dataStart] === 0x2f) {
      const b0 = bytes[dataStart + 1];
      const b1 = bytes[dataStart + 2];
      const b2 = bytes[dataStart + 3];
      const b3 = bytes[dataStart + 4];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }

    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      bytes[dataStart + 3] === 0x9d &&
      bytes[dataStart + 4] === 0x01 &&
      bytes[dataStart + 5] === 0x2a
    ) {
      return {
        width: bytes.readUInt16LE(dataStart + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataStart + 8) & 0x3fff,
      };
    }

    offset = dataEnd + (chunkSize % 2);
  }

  return null;
}

function readAvifDimensions(bytes) {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return null;

  function scanBoxes(start, end, depth = 0) {
    if (depth > 8) return null;
    let offset = start;

    while (offset + 8 <= end) {
      let size = bytes.readUInt32BE(offset);
      const type = ascii(bytes, offset + 4, offset + 8);
      let headerSize = 8;

      if (size === 1) {
        if (offset + 16 > end) return null;
        const largeSize = bytes.readBigUInt64BE(offset + 8);
        if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(largeSize);
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }

      if (size < headerSize || offset + size > end) return null;

      const dataStart = offset + headerSize;
      const dataEnd = offset + size;

      if (type === "ispe" && dataStart + 12 <= dataEnd) {
        return {
          width: bytes.readUInt32BE(dataStart + 4),
          height: bytes.readUInt32BE(dataStart + 8),
        };
      }

      if (["meta", "iprp", "ipco", "moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
        const childStart = type === "meta" ? dataStart + 4 : dataStart;
        const dimensions = scanBoxes(childStart, dataEnd, depth + 1);
        if (dimensions) return dimensions;
      }

      offset += size;
    }

    return null;
  }

  return scanBoxes(0, bytes.length);
}

function imageDimensionsFromBuffer(bytes) {
  const dimensions =
    readPngDimensions(bytes) ||
    readJpegDimensions(bytes) ||
    readGifDimensions(bytes) ||
    readWebpDimensions(bytes) ||
    readAvifDimensions(bytes);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return DEFAULT_PAGE_DIMENSIONS;
  }

  return dimensions;
}

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
      const existingBytes = await fs.readFile(existing.filePath);
      const dimensions = imageDimensionsFromBuffer(existingBytes);
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
        height: dimensions.height,
        mimeType: mimeTypeFromExtension(existing.extension),
        relativePath,
        reused: true,
        sizeBytes: existing.stats.size,
        width: dimensions.width,
      };
    }

    const downloaded = await downloadImage(sourceUrl);
    const dimensions = imageDimensionsFromBuffer(downloaded.bytes);
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
      height: dimensions.height,
      mimeType: downloaded.contentType || mimeTypeFromExtension(extension),
      relativePath,
      reused: false,
      sizeBytes: downloaded.bytes.length,
      width: dimensions.width,
    };
  }

  async importPageFile({ assetId, chapterId, pageIndex, projectId, sourcePath }) {
    if (!sourcePath) {
      throw new Error("Chapter page import requires an image file path");
    }

    const resolvedSourcePath = path.resolve(sourcePath);
    const stats = await fs.stat(resolvedSourcePath);
    if (!stats.isFile()) {
      throw new Error(`Chapter page import path is not a file: ${sourcePath}`);
    }

    const sourceExtension = path.extname(resolvedSourcePath).toLowerCase();
    if (!KNOWN_IMAGE_EXTENSIONS.includes(sourceExtension)) {
      throw new Error(`Unsupported chapter page image type: ${sourceExtension || "unknown"}`);
    }

    const sourceBytes = await fs.readFile(resolvedSourcePath);
    const dimensions = imageDimensionsFromBuffer(sourceBytes);
    const extension = sourceExtension === ".jpeg" ? ".jpg" : sourceExtension;
    const directory = this.chapterPagesPath(projectId, chapterId);
    const pageNumber = String(pageIndex).padStart(4, "0");
    const fileName = `page-${pageNumber}${extension}`;
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
    await fs.writeFile(tempPath, sourceBytes);
    await fs.rename(tempPath, filePath);

    return {
      assetId,
      cacheUrl: pageCacheUrl(relativePath),
      filePath,
      height: dimensions.height,
      mimeType: mimeTypeFromExtension(extension),
      relativePath,
      reused: false,
      sizeBytes: stats.size,
      width: dimensions.width,
    };
  }
}

module.exports = {
  ChapterPageStore,
  PAGE_CACHE_HOST,
};
