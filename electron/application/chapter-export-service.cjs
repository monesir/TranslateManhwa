const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { PAGE_CACHE_HOST } = require("../data/chapter-page-store.cjs");
const { COVER_CACHE_SCHEME, sanitizeFilePart } = require("../data/cover-cache.cjs");
const {
  TranslationWorkspaceRepository,
} = require("../data/repositories/translation-workspace-repository.cjs");
const { getRuntimePaths, pythonRuntimeEnv } = require("../runtime-paths.cjs");

const execFileAsync = promisify(execFile);
const EXPORT_SCRIPT = path.join(__dirname, "..", "ocr", "scripts", "export-chapter-pages.py");
const RUNTIME_PATHS = getRuntimePaths();
const REPO_ROOT = RUNTIME_PATHS.repoRoot;
const EXPORT_TEMP_ROOT = RUNTIME_PATHS.tempRoot;
const DEFAULT_OCR_PYTHON = path.join(REPO_ROOT, ".venv-ocr", "Scripts", "python.exe");
const TYPESET_FONT_PATH = path.join(REPO_ROOT, "src", "assets", "fonts", "JF-Flat-Regular.ttf");

function exportId() {
  return `export_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function assertInsideWorkspace(workspacePath, candidatePath) {
  const workspaceRoot = path.resolve(workspacePath);
  const resolved = path.resolve(candidatePath);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Cached asset path escaped the workspace directory");
  }
  return resolved;
}

function localPathFromCacheUrl(workspacePath, assetPath) {
  if (!assetPath || !assetPath.startsWith(`${COVER_CACHE_SCHEME}://${PAGE_CACHE_HOST}/`)) {
    throw new Error("Export requires local cached page assets");
  }

  const url = new URL(assetPath);
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  return assertInsideWorkspace(workspacePath, path.join(workspacePath, relativePath));
}

function bestTextForExport(unit) {
  return [unit.finalTranslation, unit.microsoftTranslation, unit.aiTranslation]
    .map((text) => String(text ?? "").trim())
    .find((text) => text.length > 0) ?? "";
}

function compositionTextForExport(composition) {
  const spans = composition?.content?.spans;
  if (Array.isArray(spans) && spans.length > 0) {
    return spans.map((span) => String(span?.text ?? "")).join("").trim();
  }
  return String(composition?.plainText ?? "").trim();
}

function compositionForExport(composition) {
  return {
    box: composition.box,
    content: composition.content ?? null,
    effects: composition.effects ?? null,
    id: composition.id,
    kind: composition.kind,
    layout: composition.layout,
    plainText: compositionTextForExport(composition),
    renderOrder: composition.renderOrder ?? 0,
    style: composition.style,
    textUnitId: composition.textUnitId ?? null,
  };
}

function markForExport(workspacePath, mark) {
  if (mark.kind === "clean_patch") {
    return {
      kind: "clean_patch",
      opacity: mark.opacity ?? 1,
      patchPath: localPathFromCacheUrl(workspacePath, mark.patchUrl),
      region: mark.region,
    };
  }

  return {
    color: mark.color,
    kind: mark.kind ?? "brush",
    opacity: mark.opacity ?? 1,
    points: mark.points ?? [],
    size: mark.size ?? 1,
  };
}

function resolvePython() {
  if (process.env.FLORIS_PYTHON) return process.env.FLORIS_PYTHON;
  if (fs.existsSync(DEFAULT_OCR_PYTHON)) return DEFAULT_OCR_PYTHON;
  return "python";
}

class ChapterExportService {
  constructor(db, options = {}) {
    this.db = db;
    this.workspacePath = options.workspacePath;
    this.repository = new TranslationWorkspaceRepository(db);
  }

  buildManifest(chapterId, outputDir) {
    if (!this.workspacePath) throw new Error("Export requires a workspace path");
    const workspace = this.repository.getChapterForTranslation(chapterId);
    if (!workspace) throw new Error("Chapter not found");
    if (workspace.pages.length === 0) throw new Error("No local pages are available for export");
    if (!fs.existsSync(TYPESET_FONT_PATH)) throw new Error(`Typesetting font not found: ${TYPESET_FONT_PATH}`);

    const marksByPage = new Map();
    for (const mark of workspace.pageEditMarks ?? []) {
      const group = marksByPage.get(mark.pageId) ?? [];
      group.push(mark);
      marksByPage.set(mark.pageId, group);
    }

    const textUnitsByPage = new Map();
    const textCompositionsByPage = new Map();
    const textUnitIdsWithCompositions = new Set();
    for (const composition of workspace.textCompositions ?? []) {
      const text = compositionTextForExport(composition);
      if (!text) continue;
      if (composition.textUnitId) textUnitIdsWithCompositions.add(composition.textUnitId);
      const group = textCompositionsByPage.get(composition.pageId) ?? [];
      group.push(compositionForExport({
        ...composition,
        plainText: text,
      }));
      textCompositionsByPage.set(composition.pageId, group);
    }

    for (const unit of workspace.textUnits ?? []) {
      if (textUnitIdsWithCompositions.has(unit.id)) continue;
      const text = bestTextForExport(unit);
      if (!text) continue;
      const group = textUnitsByPage.get(unit.pageId) ?? [];
      group.push({
        box: unit.typesetting?.box ?? unit.region,
        color: unit.typesetting?.color ?? "#17110B",
        fontSize: unit.typesetting?.fontSize ?? 18,
        text,
        textUnitId: unit.id,
      });
      textUnitsByPage.set(unit.pageId, group);
    }

    return {
      fontPath: TYPESET_FONT_PATH,
      outputDir,
      pages: workspace.pages.map((page) => ({
        height: page.height,
        id: page.id,
        imagePath: localPathFromCacheUrl(this.workspacePath, page.imageUrl),
        index: page.index,
        marks: (marksByPage.get(page.id) ?? []).map((mark) => markForExport(this.workspacePath, mark)),
        textCompositions: textCompositionsByPage.get(page.id) ?? [],
        textUnits: textUnitsByPage.get(page.id) ?? [],
        width: page.width,
      })),
      projectId: workspace.project.id,
      projectTitle: workspace.project.title,
      chapterId: workspace.chapter.id,
      chapterLabel: workspace.chapter.displayLabel,
    };
  }

  async exportChapter(chapterId, input = {}) {
    const baseOutputDirectory = String(input.outputDirectory ?? "").trim();
    if (!baseOutputDirectory) throw new Error("Export output directory is required");

    const workspace = this.repository.getChapterForTranslation(chapterId);
    if (!workspace) throw new Error("Chapter not found");

    const outputDirectory = path.join(
      baseOutputDirectory,
      `${sanitizeFilePart(workspace.project.title)}_${sanitizeFilePart(workspace.chapter.displayLabel)}_${timestampSlug()}`,
    );
    await fsp.mkdir(outputDirectory, { recursive: true });

    const manifest = this.buildManifest(chapterId, outputDirectory);
    const manifestPath = path.join(EXPORT_TEMP_ROOT, `export-manifest-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await fsp.mkdir(EXPORT_TEMP_ROOT, { recursive: true });
    await fsp.writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    try {
      const { stdout, stderr } = await execFileAsync(resolvePython(), [EXPORT_SCRIPT, manifestPath], {
        cwd: REPO_ROOT,
        env: pythonRuntimeEnv(),
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      if (stderr?.trim()) {
        console.warn("Chapter export warnings:", stderr.trim());
      }
      const parsed = JSON.parse(stdout.trim() || "{}");
      const exported = Array.isArray(parsed.exported) ? parsed.exported : [];
      const timestamp = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO exports (id, project_id, chapter_id, kind, output_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        exportId(),
        manifest.projectId,
        chapterId,
        "chapter_pages_png",
        outputDirectory,
        timestamp,
      );

      return {
        chapterId,
        files: exported,
        kind: "chapter_pages_png",
        outputPath: outputDirectory,
        pagesExported: exported.length,
        status: "completed",
      };
    } finally {
      await fsp.rm(manifestPath, { force: true }).catch(() => {});
    }
  }
}

module.exports = {
  ChapterExportService,
};
