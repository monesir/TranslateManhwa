import type {
  Chapter,
  ChapterTranslationWorkspace,
  Character,
  CharacterAlias,
  CharacterInput,
  CreateChapterInput,
  CreateProjectInput,
  GlossaryTermInput,
  ExplorerSeriesDetails,
  GlossaryTerm,
  LibraryStats,
  MergeChapterPagesInput,
  MergeChapterPagesResult,
  OcrProviderStatus,
  OcrRegionRunOptions,
  OcrRunOptions,
  OcrRunResult,
  Page,
  PageColorSampleInput,
  PageColorSampleResult,
  PageCleanTextInput,
  PageEditMark,
  PageEditMarkInput,
  Project,
  ProjectOverview,
  RemoveMergedPagesResult,
  RegionBox,
  SourceCatalogItem,
  SourceChapterPreparationResult,
  SourceChapterPage,
  SourcePagedResult,
  SourceProjectImportResult,
  SourceTitleDetailsResult,
  SourceTitleSummary,
  TextUnit,
  TextUnitTypesettingInput,
  TranslateTextUnitsInput,
  TranslateTextUnitsResult,
  DeleteOcrResultsInput,
  DeleteOcrResultsResult,
  UpdateTextUnitSourceInput,
  ChapterTextSizeInput,
} from "../types/domain";
import {
  characters,
  chapters,
  explorerSeries,
  glossaryTerms,
  libraryStats,
  pages,
  projectOverviews,
  projects,
  textUnits,
} from "./data";

let mutableTextUnits: TextUnit[] = [...textUnits];
let mutableCharacters: Character[] = [...characters];
let mutableGlossaryTerms: GlossaryTerm[] = [...glossaryTerms];
let mutableProjects: Project[] = [...projects];
let mutableProjectOverviews: ProjectOverview[] = [...projectOverviews];
let mutableChapters: Chapter[] = [...chapters];
let mutablePages: Page[] = [...pages];
let mutablePageEditMarks: PageEditMark[] = [];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "untitled";
}

function listMockCategories(projectId: string) {
  const categories = new Set<string>();
  for (const term of mutableGlossaryTerms) {
    if (term.projectId === projectId && term.category.trim()) {
      categories.add(term.category);
    }
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

const delay = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });

function clampFontSize(value: number) {
  return Math.max(8, Math.min(72, Math.round(value)));
}

function clampTextBox(box: RegionBox | undefined, fallback: RegionBox, page?: Page): RegionBox {
  const source = box ?? fallback;
  const pageWidth = page?.width ?? Math.max(source.x + source.width, fallback.x + fallback.width);
  const pageHeight = page?.height ?? Math.max(source.y + source.height, fallback.y + fallback.height);
  const width = Math.min(Math.max(16, Number(source.width) || fallback.width), pageWidth);
  const height = Math.min(Math.max(12, Number(source.height) || fallback.height), pageHeight);
  const x = Math.max(0, Math.min(Number(source.x) || 0, pageWidth - width));
  const y = Math.max(0, Math.min(Number(source.y) || 0, pageHeight - height));
  return { type: "box", x, y, width, height };
}

function expandMockRegion(region: RegionBox, page: Page, padding: { x: number; y: number }): RegionBox {
  const x = Math.max(0, region.x - padding.x);
  const y = Math.max(0, region.y - padding.y);
  const right = Math.min(page.width, region.x + region.width + padding.x);
  const bottom = Math.min(page.height, region.y + region.height + padding.y);
  return {
    type: "box",
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function clampBrushSize(value: number) {
  return Math.max(1, Math.min(96, Math.round((Number(value) || 18) * 100) / 100));
}

function normalizeHexColor(value: string) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return "#FFFFFF";
}

export async function listProjects(): Promise<Project[]> {
  if (window.florisApi) return window.florisApi.listProjects();
  return delay(mutableProjects);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (window.florisApi) return window.florisApi.createProject(input);

  const timestamp = new Date().toISOString();
  const slug = slugify(input.title);
  const project: Project = {
    id: `project_${slug}_${Date.now()}`,
    title: input.title,
    arabicTitle: input.arabicTitle || undefined,
    originalTitle: input.originalTitle || input.title,
    sourceLanguage: input.sourceLanguage || "English",
    targetLanguage: input.targetLanguage || "Arabic",
    coverTone: "steel",
    coverUrl: null,
    status: "Active",
    lastModifiedAt: timestamp,
    progress: 0,
  };
  const overview: ProjectOverview = {
    ...project,
    chaptersCount: 0,
    charactersCount: 0,
    generalTermsCount: 0,
    contextSummary: input.contextSummary || input.description || "",
    genres: input.genres,
  };

  mutableProjects = [project, ...mutableProjects];
  mutableProjectOverviews = [overview, ...mutableProjectOverviews];
  return delay(project);
}

export async function getLibraryStats(): Promise<LibraryStats> {
  if (window.florisApi) return window.florisApi.getLibraryStats();
  return delay(libraryStats);
}

export async function listExplorerSeries(): Promise<ExplorerSeriesDetails[]> {
  return delay(explorerSeries);
}

export async function getExplorerSeriesDetails(
  externalSeriesId: string,
): Promise<ExplorerSeriesDetails | undefined> {
  return delay(explorerSeries.find((series) => series.externalSeriesId === externalSeriesId));
}

export async function listSourceCatalog(): Promise<SourceCatalogItem[]> {
  if (window.florisApi) return window.florisApi.listSourceCatalog();
  return delay([]);
}

export async function browseSourceTitles(
  sourceId: string,
  page = 1,
): Promise<SourcePagedResult<SourceTitleSummary>> {
  if (window.florisApi) return window.florisApi.browseSourceTitles(sourceId, page);
  return delay({ items: [], page, hasNextPage: false });
}

export async function searchSourceTitles(
  sourceId: string,
  query: string,
  page = 1,
): Promise<SourcePagedResult<SourceTitleSummary>> {
  if (window.florisApi) return window.florisApi.searchSourceTitles(sourceId, query, page);
  return delay({ items: [], page, hasNextPage: false });
}

export async function getSourceTitleDetails(
  sourceId: string,
  titleId: string,
): Promise<SourceTitleDetailsResult | undefined> {
  if (window.florisApi) return window.florisApi.getSourceTitleDetails(sourceId, titleId);
  return delay(undefined);
}

export async function getSourceChapterPages(
  sourceId: string,
  titleId: string,
  chapterId: string,
): Promise<SourceChapterPage[]> {
  if (window.florisApi) return window.florisApi.getSourceChapterPages(sourceId, titleId, chapterId);
  return delay([]);
}

export async function ensureSourceProject(
  sourceId: string,
  titleId: string,
): Promise<SourceProjectImportResult> {
  if (window.florisApi) return window.florisApi.ensureSourceProject(sourceId, titleId);
  void sourceId;
  void titleId;
  throw new Error("Source import requires the Electron runtime");
}

export async function prepareSourceChapter(
  sourceId: string,
  titleId: string,
  chapterId: string,
): Promise<SourceChapterPreparationResult> {
  if (window.florisApi) return window.florisApi.prepareSourceChapter(sourceId, titleId, chapterId);
  void sourceId;
  void titleId;
  void chapterId;
  throw new Error("Chapter preparation requires the Electron runtime");
}

export async function prepareLibraryChapter(
  chapterId: string,
): Promise<SourceChapterPreparationResult> {
  if (window.florisApi) return window.florisApi.prepareLibraryChapter(chapterId);
  void chapterId;
  throw new Error("Library chapter preparation requires the Electron runtime");
}

export async function pickChapterImages(): Promise<string[]> {
  if (window.florisApi) return window.florisApi.pickChapterImages();
  throw new Error("Choosing chapter images requires the Electron runtime");
}

export async function createProjectChapter(
  projectId: string,
  input: CreateChapterInput,
): Promise<SourceChapterPreparationResult> {
  if (window.florisApi) return window.florisApi.createProjectChapter(projectId, input);

  const project = mutableProjects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found");

  const timestamp = new Date().toISOString();
  const number = input.number.trim() || "1";
  const title = input.title?.trim() || undefined;
  const chapterId = `${projectId}_chapter_${Date.now()}`;
  const chapter: Chapter = {
    id: chapterId,
    projectId,
    number,
    title,
    displayLabel: `Chapter ${number}`,
    status: "In Progress",
    internalStatus: "Images Ready",
    downloadStatus: "Downloaded",
    downloadedAt: timestamp,
    pagesCount: input.imagePaths.length,
    textUnitsCount: 0,
    progress: 0,
    updatedAt: timestamp,
  };
  const chapterPages: Page[] = input.imagePaths.map((_imagePath, index) => ({
    id: `page_${chapterId}_${index + 1}`,
    chapterId,
    index: index + 1,
    imageTone: index % 2 === 0 ? "night" : "gate",
    imageUrl: null,
    width: 820,
    height: 1240,
  }));

  mutableChapters = [...mutableChapters, chapter];
  mutablePages = [...mutablePages, ...chapterPages];
  mutableProjects = mutableProjects.map((item) =>
    item.id === projectId
      ? {
          ...item,
          lastWorkedChapterId: chapterId,
          lastWorkedChapterLabel: chapter.displayLabel,
          lastModifiedAt: timestamp,
        }
      : item,
  );
  mutableProjectOverviews = mutableProjectOverviews.map((item) =>
    item.id === projectId
      ? {
          ...item,
          chaptersCount: item.chaptersCount + 1,
          lastWorkedChapterId: chapterId,
          lastWorkedChapterLabel: chapter.displayLabel,
          lastModifiedAt: timestamp,
        }
      : item,
  );

  return delay({
    projectId,
    chapterId,
    pagesCount: chapterPages.length,
    chapter,
  });
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverview | undefined> {
  if (window.florisApi) return window.florisApi.getProjectOverview(projectId);
  return delay(mutableProjectOverviews.find((project) => project.id === projectId));
}

export async function listProjectChapters(projectId: string) {
  if (window.florisApi) return window.florisApi.listProjectChapters(projectId);
  return delay(mutableChapters.filter((chapter) => chapter.projectId === projectId));
}

export async function getProjectDictionary(projectId: string) {
  if (window.florisApi) return window.florisApi.getProjectDictionary(projectId);
  return delay({
    characters: mutableCharacters.filter((character) => character.projectId === projectId),
    glossaryTerms: mutableGlossaryTerms.filter((term) => term.projectId === projectId),
    categories: listMockCategories(projectId),
  });
}

export async function getChapterForTranslation(
  chapterId: string,
): Promise<ChapterTranslationWorkspace | undefined> {
  if (window.florisApi) return window.florisApi.getChapterForTranslation(chapterId);

  const chapter = mutableChapters.find((item) => item.id === chapterId);
  if (!chapter) return delay(undefined);

  const project = mutableProjects.find((item) => item.id === chapter.projectId);
  if (!project) return delay(undefined);

  const allChapterPages = mutablePages.filter((page) => page.chapterId === chapterId);
  const hasMergedPages = allChapterPages.some((page) => page.pageKind === "merged");
  const chapterPages = allChapterPages.filter((page) =>
    hasMergedPages ? page.pageKind === "merged" : (page.pageKind ?? "original") === "original",
  );

  return delay({
    project,
    chapter,
    pages: chapterPages,
    pageEditMarks: mutablePageEditMarks.filter((mark) => mark.chapterId === chapterId),
    textUnits: mutableTextUnits.filter((unit) => unit.chapterId === chapterId),
    characters: mutableCharacters.filter((character) => character.projectId === project.id),
    glossaryTerms: mutableGlossaryTerms.filter((term) => term.projectId === project.id),
  });
}

export async function listOcrProviders(languageHint = ""): Promise<OcrProviderStatus[]> {
  if (window.florisApi) return window.florisApi.listOcrProviders(languageHint);
  void languageHint;
  return delay([
    {
      available: true,
      engine: "mock",
      id: "windows",
      kind: "local",
      label: "Windows OCR (Recommended)",
      reason: null,
      setup: "Electron runtime required for real OCR.",
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "paddleocr",
      kind: "local",
      label: "PaddleOCR",
      reason: "Electron runtime required for real OCR.",
      setup: "Install Python packages: pip install paddleocr paddlepaddle",
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "tesseract",
      kind: "local",
      label: "Tesseract",
      reason: "Electron runtime required for real OCR.",
      setup: "Install Tesseract and put tesseract.exe on PATH.",
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "easyocr",
      kind: "local",
      label: "EasyOCR",
      reason: "Electron runtime required for real OCR.",
      setup: "Install Python package: pip install easyocr",
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "rapidocr",
      kind: "local",
      label: "RapidOCR",
      reason: "Electron runtime required for real OCR.",
      setup: "Install Python package: pip install rapidocr",
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "doctr",
      kind: "local",
      label: "docTR",
      reason: "Electron runtime required for real OCR.",
      setup: 'Install Python package: pip install "python-doctr[torch]"',
      supportsRegions: true,
    },
    {
      available: false,
      engine: "mock",
      id: "manga-ocr",
      kind: "local",
      label: "Manga OCR",
      reason: "Electron runtime required for real OCR.",
      setup: "Install Python package: pip install manga-ocr",
      supportsRegions: true,
    },
  ]);
}

export async function runOcrForPage(
  pageId: string,
  input: OcrRunOptions,
): Promise<OcrRunResult> {
  if (window.florisApi) return window.florisApi.runOcrForPage(pageId, input);

  const page = mutablePages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found");
  const timestamp = new Date().toISOString();
  const existingCount = mutableTextUnits.filter((unit) => unit.chapterId === page.chapterId).length;
  if (input.replaceExisting !== false) {
    mutableTextUnits = mutableTextUnits.filter((unit) => unit.pageId !== pageId);
  }
  const region = {
    type: "box" as const,
    x: Math.round(page.width * 0.18),
    y: Math.round(page.height * 0.16),
    width: Math.round(page.width * 0.42),
    height: Math.round(page.height * 0.09),
  };
  const unit: TextUnit = {
    aiTranslation: "",
    chapterId: page.chapterId,
    finalTranslation: "",
    id: `textunit_${pageId}_${Date.now()}`,
    matchedCharacterIds: [],
    matchedGlossaryTermIds: [],
    microsoftTranslation: "",
    ocrConfidence: 0.85,
    ocrProvider: input.providerId,
    order: existingCount + 1,
    pageId,
    region,
    reviewStatus: "Needs Review",
    sourceStatus: "Needs Review",
    sourceText: "Mock OCR text",
    typesetting: { box: region, fontSize: 18 },
  };
  mutableTextUnits = [...mutableTextUnits, unit];
  let cleanPatchesCreated = 0;
  if (input.autoCleanText) {
    await cleanPageText(pageId, {
      feather: 2,
      maskExpansion: input.autoCleanMaskExpansion ?? 6,
      method: "telea",
      mode: "auto_after_ocr",
      policy: input.autoCleanPolicy ?? "safe_bubbles_only",
      provider: input.autoCleanProvider ?? "bubble_fill",
      region: expandMockRegion(region, page, { x: 6, y: 4 }),
      source: "ocr_page",
      sourceTextUnitId: unit.id,
    });
    cleanPatchesCreated = 1;
  }
  mutableChapters = mutableChapters.map((chapter) =>
    chapter.id === page.chapterId
      ? { ...chapter, internalStatus: "OCR Done", textUnitsCount: chapter.textUnitsCount + 1, updatedAt: timestamp }
      : chapter,
  );
  return delay({
    averageConfidence: 0.85,
    candidatesCreated: 1,
    chapterId: page.chapterId,
    cleanPatchesCreated,
    languageDetected: input.languageHint ?? null,
    pagesProcessed: 1,
    provider: input.providerId,
    runId: `ocr_run_${Date.now()}`,
    status: "completed",
    textUnitsCreated: 1,
  });
}

export async function runOcrForRegion(
  pageId: string,
  input: OcrRegionRunOptions,
): Promise<OcrRunResult> {
  if (window.florisApi) return window.florisApi.runOcrForRegion(pageId, input);

  const page = mutablePages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found");
  if (input.replaceExisting !== false) {
    const left = input.region.x;
    const top = input.region.y;
    const right = input.region.x + input.region.width;
    const bottom = input.region.y + input.region.height;
    mutableTextUnits = mutableTextUnits.filter((unit) => {
      if (unit.pageId !== pageId) return true;
      const unitRight = unit.region.x + unit.region.width;
      const unitBottom = unit.region.y + unit.region.height;
      return unitRight < left || unit.region.x > right || unitBottom < top || unit.region.y > bottom;
    });
  }

  const timestamp = new Date().toISOString();
  const order = mutableTextUnits.filter((unit) => unit.chapterId === page.chapterId).length + 1;
  const region = input.region;
  const unit: TextUnit = {
    aiTranslation: "",
    chapterId: page.chapterId,
    finalTranslation: "",
    id: `textunit_region_${pageId}_${Date.now()}`,
    matchedCharacterIds: [],
    matchedGlossaryTermIds: [],
    microsoftTranslation: "",
    ocrConfidence: 0.87,
    ocrProvider: input.providerId,
    order,
    pageId,
    region,
    reviewStatus: "Needs Review",
    sourceStatus: "Needs Review",
    sourceText: "Mock selected OCR text",
    typesetting: { box: region, fontSize: 18 },
  };
  mutableTextUnits = [...mutableTextUnits, unit];
  let cleanPatchesCreated = 0;
  if (input.autoCleanText) {
    await cleanPageText(pageId, {
      feather: 2,
      maskExpansion: input.autoCleanMaskExpansion ?? 6,
      method: "telea",
      mode: "auto_after_ocr",
      policy: input.autoCleanPolicy ?? "safe_bubbles_only",
      provider: input.autoCleanProvider ?? "bubble_fill",
      region: expandMockRegion(region, page, { x: 6, y: 4 }),
      source: "ocr_region",
      sourceTextUnitId: unit.id,
    });
    cleanPatchesCreated = 1;
  }
  mutableChapters = mutableChapters.map((chapter) =>
    chapter.id === page.chapterId
      ? { ...chapter, internalStatus: "OCR Done", textUnitsCount: chapter.textUnitsCount + 1, updatedAt: timestamp }
      : chapter,
  );

  return delay({
    averageConfidence: 0.87,
    candidatesCreated: 1,
    chapterId: page.chapterId,
    cleanPatchesCreated,
    languageDetected: input.languageHint ?? null,
    pagesProcessed: 1,
    provider: input.providerId,
    runId: `ocr_run_${Date.now()}`,
    status: "completed",
    textUnitsCreated: 1,
  });
}

export async function runOcrForChapter(
  chapterId: string,
  input: OcrRunOptions,
): Promise<OcrRunResult> {
  if (window.florisApi) return window.florisApi.runOcrForChapter(chapterId, input);

  const chapterPages = mutablePages.filter((page) => page.chapterId === chapterId);
  if (chapterPages.length === 0) throw new Error("Chapter has no pages");
  let cleanPatchesCreated = 0;
  let created = 0;
  for (const page of chapterPages) {
    const result = await runOcrForPage(page.id, { ...input, replaceExisting: input.replaceExisting });
    cleanPatchesCreated += result.cleanPatchesCreated ?? 0;
    created += result.textUnitsCreated;
  }
  return delay({
    averageConfidence: 0.85,
    candidatesCreated: created,
    chapterId,
    cleanPatchesCreated,
    languageDetected: input.languageHint ?? null,
    pagesProcessed: chapterPages.length,
    provider: input.providerId,
    runId: `ocr_run_${Date.now()}`,
    status: "completed",
    textUnitsCreated: created,
  });
}

export async function updateTextUnitSource(
  textUnitId: string,
  input: UpdateTextUnitSourceInput,
): Promise<TextUnit> {
  if (window.florisApi) return window.florisApi.updateTextUnitSource(textUnitId, input);

  const existing = mutableTextUnits.find((unit) => unit.id === textUnitId);
  if (!existing) throw new Error("Text unit not found");
  const updated: TextUnit = {
    ...existing,
    sourceStatus: input.sourceStatus,
    sourceText: input.sourceText,
  };
  mutableTextUnits = mutableTextUnits.map((unit) => (unit.id === textUnitId ? updated : unit));
  return delay(updated, 80);
}

export async function updateFinalTranslation(textUnitId: string, text: string): Promise<TextUnit> {
  if (window.florisApi) return window.florisApi.updateFinalTranslation(textUnitId, text);

  const existing = mutableTextUnits.find((unit) => unit.id === textUnitId);
  if (!existing) {
    throw new Error("Text unit not found");
  }

  const updated: TextUnit = {
    ...existing,
    finalTranslation: text,
    reviewStatus: text.trim() ? existing.reviewStatus : "Needs Review",
  };

  mutableTextUnits = mutableTextUnits.map((unit) => (unit.id === textUnitId ? updated : unit));
  return delay(updated, 80);
}

export async function translateWithMicrosoft(input: TranslateTextUnitsInput): Promise<TranslateTextUnitsResult> {
  if (window.florisApi) return window.florisApi.translateWithMicrosoft(input);

  const chapterId = input.chapterId;
  const runId = `translation_run_mock_${Date.now()}`;
  const scopedUnits = mutableTextUnits.filter((unit) => {
    if (unit.chapterId !== chapterId) return false;
    if (input.scope === "text_unit") return unit.id === input.textUnitId;
    if (input.scope === "page") return unit.pageId === input.pageId;
    return true;
  });
  let translatedCount = 0;
  mutableTextUnits = mutableTextUnits.map((unit) => {
    if (!scopedUnits.some((item) => item.id === unit.id)) return unit;
    translatedCount += 1;
    return {
      ...unit,
      microsoftTranslation: `[Microsoft] ${unit.sourceText}`,
    };
  });
  return delay({
    chapterId,
    failedCount: 0,
    provider: "microsoft",
    runId,
    status: "completed",
    translatedCount,
  }, 180);
}

export async function deleteOcrResults(input: DeleteOcrResultsInput): Promise<DeleteOcrResultsResult> {
  if (window.florisApi) return window.florisApi.deleteOcrResults(input);

  const targetUnits = mutableTextUnits.filter((unit) =>
    unit.chapterId === input.chapterId && (!input.pageId || unit.pageId === input.pageId),
  );
  const targetIds = new Set(targetUnits.map((unit) => unit.id));
  mutableTextUnits = mutableTextUnits.filter((unit) => !targetIds.has(unit.id));
  let autoCleanPatchesDeleted = 0;
  if (input.includeAutoCleanPatches !== false) {
    const before = mutablePageEditMarks.length;
    mutablePageEditMarks = mutablePageEditMarks.filter((mark) =>
      !(
        mark.chapterId === input.chapterId &&
        (!input.pageId || mark.pageId === input.pageId) &&
        mark.cleanMode === "auto_after_ocr"
      ),
    );
    autoCleanPatchesDeleted = before - mutablePageEditMarks.length;
  }

  return delay({
    autoCleanPatchesDeleted,
    candidatesDeleted: targetUnits.length,
    chapterId: input.chapterId,
    manualEditsKept: mutablePageEditMarks.filter((mark) => mark.chapterId === input.chapterId).length,
    pageId: input.pageId,
    textUnitsDeleted: targetUnits.length,
    translationCandidatesDeleted: targetUnits.length,
  }, 120);
}

export async function mergeChapterPages(
  chapterId: string,
  input: MergeChapterPagesInput,
): Promise<MergeChapterPagesResult> {
  if (window.florisApi) return window.florisApi.mergeChapterPages(chapterId, input);

  if (input.replaceExisting !== false) {
    mutablePages = mutablePages.filter((page) => !(page.chapterId === chapterId && page.pageKind === "merged"));
  }
  const originals = mutablePages
    .filter((page) => page.chapterId === chapterId && (page.pageKind ?? "original") === "original")
    .sort((first, second) => first.index - second.index);
  const direction = input.direction ?? "vertical";
  const created: Page[] = [];
  for (let index = 0; index < originals.length; index += 2) {
    const pair = originals.slice(index, index + 2);
    const width = direction === "horizontal"
      ? pair.reduce((sum, page) => sum + page.width, 0)
      : Math.max(...pair.map((page) => page.width));
    const height = direction === "horizontal"
      ? Math.max(...pair.map((page) => page.height))
      : pair.reduce((sum, page) => sum + page.height, 0);
    created.push({
      chapterId,
      height,
      id: `mock_merged_${chapterId}_${index}`,
      imageTone: pair[0]?.imageTone ?? "night",
      imageUrl: pair[0]?.imageUrl ?? null,
      index: created.length + 1,
      mergedGroupId: `mock_merge_${chapterId}`,
      pageKind: "merged",
      width,
    });
  }
  mutablePages = [...mutablePages, ...created];
  return delay({
    chapterId,
    direction,
    mergedPagesCreated: created.length,
    sourcePagesUsed: originals.length,
  }, 160);
}

export async function removeMergedPages(chapterId: string): Promise<RemoveMergedPagesResult> {
  if (window.florisApi) return window.florisApi.removeMergedPages(chapterId);

  const before = mutablePages.length;
  mutablePages = mutablePages.filter((page) => !(page.chapterId === chapterId && page.pageKind === "merged"));
  return delay({
    assetsDeleted: before - mutablePages.length,
    chapterId,
    mergedPagesDeleted: before - mutablePages.length,
  }, 120);
}

export async function deleteTextUnit(textUnitId: string): Promise<{ chapterId: string; id: string }> {
  if (window.florisApi) return window.florisApi.deleteTextUnit(textUnitId);

  const existing = mutableTextUnits.find((unit) => unit.id === textUnitId);
  if (!existing) throw new Error("Text unit not found");

  mutableTextUnits = mutableTextUnits
    .filter((unit) => unit.id !== textUnitId)
    .map((unit) =>
      unit.chapterId === existing.chapterId && unit.order > existing.order
        ? { ...unit, order: unit.order - 1 }
        : unit,
    );
  mutableChapters = mutableChapters.map((chapter) =>
    chapter.id === existing.chapterId
      ? { ...chapter, textUnitsCount: Math.max(0, chapter.textUnitsCount - 1), updatedAt: new Date().toISOString() }
      : chapter,
  );

  return delay({ chapterId: existing.chapterId, id: textUnitId }, 80);
}

export async function updateTextUnitTypesetting(
  textUnitId: string,
  input: TextUnitTypesettingInput,
): Promise<{ box: RegionBox; chapterId: string; fontSize: number; id: string }> {
  if (window.florisApi) return window.florisApi.updateTextUnitTypesetting(textUnitId, input);

  const existing = mutableTextUnits.find((unit) => unit.id === textUnitId);
  if (!existing) throw new Error("Text unit not found");

  const page = mutablePages.find((item) => item.id === existing.pageId);
  const fontSize = input.fontSize == null
    ? clampFontSize(existing.typesetting?.fontSize ?? 18)
    : clampFontSize(input.fontSize);
  const box = clampTextBox(input.box, existing.typesetting?.box ?? existing.region, page);
  mutableTextUnits = mutableTextUnits.map((unit) =>
    unit.id === textUnitId ? { ...unit, typesetting: { ...unit.typesetting, box, fontSize } } : unit,
  );

  return delay({ box, chapterId: existing.chapterId, fontSize, id: textUnitId }, 80);
}

export async function updateChapterTextSize(
  chapterId: string,
  input: ChapterTextSizeInput,
): Promise<{ chapterId: string; delta: number; updated: number }> {
  if (window.florisApi) return window.florisApi.updateChapterTextSize(chapterId, input);

  const delta = Math.max(-24, Math.min(24, Math.round(Number(input.delta) || 0)));
  let updated = 0;
  mutableTextUnits = mutableTextUnits.map((unit) => {
    if (unit.chapterId !== chapterId) return unit;
    updated += 1;
    return {
      ...unit,
      typesetting: {
        ...unit.typesetting,
        box: unit.typesetting?.box ?? unit.region,
        fontSize: clampFontSize((unit.typesetting?.fontSize ?? 18) + delta),
      },
    };
  });

  return delay({ chapterId, delta, updated }, 80);
}

export async function addPageEditMark(input: PageEditMarkInput): Promise<PageEditMark> {
  if (window.florisApi) return window.florisApi.addPageEditMark(input);

  const page = mutablePages.find((item) => item.id === input.pageId);
  if (!page) throw new Error("Page not found");
  const timestamp = new Date().toISOString();
  const points = (Array.isArray(input.points) ? input.points : [])
    .map((point) => ({
      x: Math.max(0, Math.min(page.width, Number(point.x) || 0)),
      y: Math.max(0, Math.min(page.height, Number(point.y) || 0)),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) throw new Error("Drawing stroke is too short");

  const mark: PageEditMark = {
    id: `page_mark_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    chapterId: page.chapterId,
    pageId: page.id,
    kind: "brush",
    color: normalizeHexColor(input.color),
    size: clampBrushSize(input.size),
    opacity: Math.max(0.05, Math.min(1, Number(input.opacity ?? 1))),
    points,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  mutablePageEditMarks = [...mutablePageEditMarks, mark];
  return delay(mark, 80);
}

export async function deletePageEditMark(
  markId: string,
): Promise<{ chapterId: string; id: string; pageId: string }> {
  if (window.florisApi) return window.florisApi.deletePageEditMark(markId);

  const existing = mutablePageEditMarks.find((mark) => mark.id === markId);
  if (!existing) throw new Error("Page edit mark not found");
  mutablePageEditMarks = mutablePageEditMarks.filter((mark) => mark.id !== markId);
  return delay({ chapterId: existing.chapterId, id: existing.id, pageId: existing.pageId }, 80);
}

export async function samplePageColor(
  pageId: string,
  input: PageColorSampleInput,
): Promise<PageColorSampleResult> {
  if (window.florisApi) return window.florisApi.samplePageColor(pageId, input);

  const page = mutablePages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found");
  return delay({ color: "#000000", engine: "mock", pixelX: 0, pixelY: 0 }, 40);
}

export async function cleanPageText(pageId: string, input: PageCleanTextInput): Promise<PageEditMark> {
  if (window.florisApi) return window.florisApi.cleanPageText(pageId, input);

  const page = mutablePages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found");
  const timestamp = new Date().toISOString();
  const effectiveProvider = input.provider === "algorithm" ? "free_text_inpaint" : input.provider;
  const mark: PageEditMark = {
    id: `page_clean_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    chapterId: page.chapterId,
    pageId: page.id,
    kind: "clean_patch",
    classification: input.provider === "free_text_inpaint" || input.provider === "lama" ? "textured_background" : "white_bubble",
    cleanMode: input.mode,
    cleanProvider: input.provider,
    cleanSource: input.source,
    confidence: 0.92,
    feather: input.feather,
    maskExpansion: input.maskExpansion,
    metadata: input.provider === "algorithm" ? { effectiveProvider, requestedProvider: input.provider } : undefined,
    method: input.method,
    opacity: 1,
    patchUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR4nGNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC",
    region: input.region,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  mutablePageEditMarks = [...mutablePageEditMarks, mark];
  return delay(mark, 120);
}

export async function addCharacter(
  projectId: string,
  input: CharacterInput,
): Promise<Character> {
  if (window.florisApi) return window.florisApi.addCharacter(projectId, input);

  const character: Character = {
    id: `character_${Date.now()}`,
    projectId,
    englishName: input.englishName,
    arabicName: input.arabicName,
    gender: input.gender,
    aliases: input.aliases.map((alias) => ({
      id: alias.id ?? `alias_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      english: alias.english,
      arabic: alias.arabic,
    })),
    description: input.description,
  };
  mutableCharacters = [...mutableCharacters, character];
  return delay(character);
}

export async function updateCharacter(
  characterId: string,
  input: CharacterInput,
): Promise<Character> {
  if (window.florisApi) return window.florisApi.updateCharacter(characterId, input);

  const existing = mutableCharacters.find((character) => character.id === characterId);
  if (!existing) throw new Error("Character not found");

  const updated: Character = {
    id: characterId,
    projectId: existing.projectId,
    englishName: input.englishName,
    arabicName: input.arabicName,
    gender: input.gender,
    aliases: input.aliases.map((alias) => ({
      id: alias.id ?? `alias_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      english: alias.english,
      arabic: alias.arabic,
    })),
    description: input.description,
  };
  mutableCharacters = mutableCharacters.map((character) =>
    character.id === characterId ? updated : character,
  );
  return delay(updated);
}

export async function deleteCharacter(characterId: string): Promise<{ id: string }> {
  if (window.florisApi) return window.florisApi.deleteCharacter(characterId);

  mutableCharacters = mutableCharacters.filter((character) => character.id !== characterId);
  return delay({ id: characterId });
}

export async function addCharacterAlias(
  characterId: string,
  input: Omit<CharacterAlias, "id">,
): Promise<CharacterAlias> {
  if (window.florisApi) return window.florisApi.addCharacterAlias(characterId, input);

  const alias: CharacterAlias = {
    ...input,
    id: `alias_${Date.now()}`,
  };

  mutableCharacters = mutableCharacters.map((character) =>
    character.id === characterId
      ? { ...character, aliases: [...character.aliases, alias] }
      : character,
  );

  return delay(alias);
}

export async function addGlossaryTerm(
  projectId: string,
  input: GlossaryTermInput,
): Promise<GlossaryTerm> {
  if (window.florisApi) return window.florisApi.addGlossaryTerm(projectId, input);

  const term: GlossaryTerm = {
    ...input,
    id: `term_${Date.now()}`,
    projectId,
  };
  mutableGlossaryTerms = [...mutableGlossaryTerms, term];
  return delay(term);
}

export async function updateGlossaryTerm(
  termId: string,
  input: GlossaryTermInput,
): Promise<GlossaryTerm> {
  if (window.florisApi) return window.florisApi.updateGlossaryTerm(termId, input);

  const existing = mutableGlossaryTerms.find((term) => term.id === termId);
  if (!existing) throw new Error("Glossary term not found");

  const updated: GlossaryTerm = {
    ...input,
    id: termId,
    projectId: existing.projectId,
  };
  mutableGlossaryTerms = mutableGlossaryTerms.map((term) => (term.id === termId ? updated : term));
  return delay(updated);
}

export async function deleteGlossaryTerm(termId: string): Promise<{ id: string }> {
  if (window.florisApi) return window.florisApi.deleteGlossaryTerm(termId);

  mutableGlossaryTerms = mutableGlossaryTerms.filter((term) => term.id !== termId);
  return delay({ id: termId });
}
