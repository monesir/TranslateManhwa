import type {
  ChapterTranslationWorkspace,
  Character,
  CharacterAlias,
  ExplorerSeriesDetails,
  GlossaryTerm,
  LibraryStats,
  Project,
  ProjectOverview,
  TextUnit,
} from "../types/domain";
import {
  characters,
  chapters,
  explorerSeries,
  glossaryCategories,
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
let mutableCategories = [...glossaryCategories];

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
    categories: mutableCategories.filter((category) => category.projectId === projectId),
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
  input: Omit<Character, "id" | "projectId">,
): Promise<Character> {
  if (window.florisApi) return window.florisApi.addCharacter(projectId, input);

  const character: Character = {
    ...input,
    id: `character_${Date.now()}`,
    projectId,
  };
  mutableCharacters = [...mutableCharacters, character];
  return delay(character);
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

export async function addGlossaryCategory(projectId: string, name: string) {
  if (window.florisApi) return window.florisApi.addGlossaryCategory(projectId, name);

  const category = {
    id: `cat_${Date.now()}`,
    projectId,
    name,
  };
  mutableCategories = [...mutableCategories, category];
  return delay(category);
}

export async function addGlossaryTerm(
  projectId: string,
  input: Omit<GlossaryTerm, "id" | "projectId">,
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
