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
  OcrProviderStatus,
  OcrRegionRunOptions,
  OcrRunOptions,
  OcrRunResult,
  Page,
  Project,
  ProjectOverview,
  SourceCatalogItem,
  SourceChapterPreparationResult,
  SourceChapterPage,
  SourcePagedResult,
  SourceProjectImportResult,
  SourceTitleDetailsResult,
  SourceTitleSummary,
  TextUnit,
  UpdateTextUnitSourceInput,
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

  return delay({
    project,
    chapter,
    pages: mutablePages.filter((page) => page.chapterId === chapterId),
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
      label: "Windows OCR",
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
    region: {
      type: "box",
      x: Math.round(page.width * 0.18),
      y: Math.round(page.height * 0.16),
      width: Math.round(page.width * 0.42),
      height: Math.round(page.height * 0.09),
    },
    reviewStatus: "Needs Review",
    sourceStatus: "Needs Review",
    sourceText: "Mock OCR text",
  };
  mutableTextUnits = [...mutableTextUnits, unit];
  mutableChapters = mutableChapters.map((chapter) =>
    chapter.id === page.chapterId
      ? { ...chapter, internalStatus: "OCR Done", textUnitsCount: chapter.textUnitsCount + 1, updatedAt: timestamp }
      : chapter,
  );
  return delay({
    averageConfidence: 0.85,
    candidatesCreated: 1,
    chapterId: page.chapterId,
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
    region: input.region,
    reviewStatus: "Needs Review",
    sourceStatus: "Needs Review",
    sourceText: "Mock selected OCR text",
  };
  mutableTextUnits = [...mutableTextUnits, unit];
  mutableChapters = mutableChapters.map((chapter) =>
    chapter.id === page.chapterId
      ? { ...chapter, internalStatus: "OCR Done", textUnitsCount: chapter.textUnitsCount + 1, updatedAt: timestamp }
      : chapter,
  );

  return delay({
    averageConfidence: 0.87,
    candidatesCreated: 1,
    chapterId: page.chapterId,
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
  let created = 0;
  for (const page of chapterPages) {
    const result = await runOcrForPage(page.id, { ...input, replaceExisting: input.replaceExisting });
    created += result.textUnitsCreated;
  }
  return delay({
    averageConfidence: 0.85,
    candidatesCreated: created,
    chapterId,
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
