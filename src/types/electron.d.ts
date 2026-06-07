import type {
  ChapterTranslationWorkspace,
  Character,
  CharacterAlias,
  GlossaryTerm,
  LibraryStats,
  Project,
  ProjectOverview,
  SourceCatalogItem,
  SourceChapterPage,
  SourcePagedResult,
  SourceTitleDetailsResult,
  SourceTitleSummary,
  TextUnit,
} from "./domain";

interface FlorisApi {
  listProjects(): Promise<Project[]>;
  getLibraryStats(): Promise<LibraryStats>;
  getProjectOverview(projectId: string): Promise<ProjectOverview | undefined>;
  listProjectChapters(projectId: string): Promise<import("./domain").Chapter[]>;
  getProjectDictionary(projectId: string): Promise<{
    characters: Character[];
    glossaryTerms: GlossaryTerm[];
    categories: import("./domain").GlossaryCategory[];
  }>;
  getChapterForTranslation(chapterId: string): Promise<ChapterTranslationWorkspace | undefined>;
  updateFinalTranslation(textUnitId: string, text: string): Promise<TextUnit>;
  addCharacter(projectId: string, input: Omit<Character, "id" | "projectId">): Promise<Character>;
  addCharacterAlias(characterId: string, input: Omit<CharacterAlias, "id">): Promise<CharacterAlias>;
  addGlossaryCategory(
    projectId: string,
    name: string,
  ): Promise<import("./domain").GlossaryCategory>;
  addGlossaryTerm(
    projectId: string,
    input: Omit<GlossaryTerm, "id" | "projectId">,
  ): Promise<GlossaryTerm>;
  listSourceCatalog(): Promise<SourceCatalogItem[]>;
  browseSourceTitles(
    sourceId: string,
    page?: number,
  ): Promise<SourcePagedResult<SourceTitleSummary>>;
  searchSourceTitles(
    sourceId: string,
    query: string,
    page?: number,
  ): Promise<SourcePagedResult<SourceTitleSummary>>;
  getSourceTitleDetails(sourceId: string, titleId: string): Promise<SourceTitleDetailsResult>;
  getSourceChapterPages(
    sourceId: string,
    titleId: string,
    chapterId: string,
  ): Promise<SourceChapterPage[]>;
}

declare global {
  interface Window {
    florisApi?: FlorisApi;
    floris?: {
      platform: string;
      versions: {
        electron?: string;
        chrome?: string;
        node?: string;
      };
    };
  }
}

export {};
