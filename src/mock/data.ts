import type {
  Chapter,
  Character,
  ExplorerSeriesDetails,
  GlossaryTerm,
  LibraryStats,
  Page,
  Project,
  ProjectOverview,
  TextUnit,
} from "../types/domain";

export const projects: Project[] = [];

export const libraryStats: LibraryStats = {
  lastWorkedChapter: "None",
  lastModifiedAt: new Date().toISOString(),
  activeProjects: 0,
  chaptersInProgress: 0,
  completedChapters: 0,
};

export const explorerSeries: ExplorerSeriesDetails[] = [];

export const projectOverviews: ProjectOverview[] = [];

export const chapters: Chapter[] = [];

export const characters: Character[] = [];

export const glossaryTerms: GlossaryTerm[] = [];

export const pages: Page[] = [];

export const textUnits: TextUnit[] = [];
