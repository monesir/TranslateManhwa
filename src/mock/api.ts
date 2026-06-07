import type {
  ChapterTranslationWorkspace,
  Character,
  CharacterAlias,
  CharacterInput,
  GlossaryTermInput,
  ExplorerSeriesDetails,
  GlossaryTerm,
  LibraryStats,
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
  return delay(projects);
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

export async function getProjectOverview(projectId: string): Promise<ProjectOverview | undefined> {
  if (window.florisApi) return window.florisApi.getProjectOverview(projectId);
  return delay(projectOverviews.find((project) => project.id === projectId));
}

export async function listProjectChapters(projectId: string) {
  if (window.florisApi) return window.florisApi.listProjectChapters(projectId);
  return delay(chapters.filter((chapter) => chapter.projectId === projectId));
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

  const chapter = chapters.find((item) => item.id === chapterId);
  if (!chapter) return delay(undefined);

  const project = projects.find((item) => item.id === chapter.projectId);
  if (!project) return delay(undefined);

  return delay({
    project,
    chapter,
    pages: pages.filter((page) => page.chapterId === chapterId),
    textUnits: mutableTextUnits.filter((unit) => unit.chapterId === chapterId),
    characters: mutableCharacters.filter((character) => character.projectId === project.id),
    glossaryTerms: mutableGlossaryTerms.filter((term) => term.projectId === project.id),
  });
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
