export type ProjectStatus = "Active" | "Paused" | "Completed" | "Archived";

export type ChapterStatus = "Not Started" | "In Progress" | "Completed";

export type ChapterInternalStatus =
  | "Images Ready"
  | "OCR Done"
  | "Draft Translated"
  | "Human Edited"
  | "Reviewed"
  | "Typeset"
  | "Completed";

export type Gender = "Male" | "Female" | "Unknown";

export type ReviewStatus = "Not Reviewed" | "Needs Review" | "Approved";

export interface CharacterAlias {
  id: string;
  english: string;
  arabic: string;
}

export interface Character {
  id: string;
  projectId: string;
  englishName: string;
  arabicName: string;
  gender: Gender;
  aliases: CharacterAlias[];
  description?: string;
}

export interface GlossaryCategory {
  id: string;
  projectId: string;
  name: string;
}

export interface GlossaryTerm {
  id: string;
  projectId: string;
  englishTerm: string;
  arabicTerm: string;
  categoryId: string;
  categoryName: string;
  description?: string;
}

export interface Project {
  id: string;
  title: string;
  arabicTitle?: string;
  originalTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  coverTone: string;
  status: ProjectStatus;
  lastWorkedChapterId?: string;
  lastWorkedChapterLabel?: string;
  lastModifiedAt: string;
  progress: number;
}

export interface LibraryStats {
  lastWorkedChapter: string;
  lastModifiedAt: string;
  activeProjects: number;
  chaptersInProgress: number;
  completedChapters: number;
}

export interface ExplorerSeries {
  externalSeriesId: string;
  sourceName: string;
  title: string;
  originalTitle: string;
  sourceLanguage: string;
  description: string;
  genres: string[];
  coverTone: string;
  latestChapter: string;
  inLibrary: boolean;
}

export interface ExplorerChapter {
  id: string;
  label: string;
  title?: string;
  date: string;
}

export interface ExplorerSeriesDetails extends ExplorerSeries {
  author: string;
  artist: string;
  chapters: ExplorerChapter[];
}

export type SourceCapability =
  | "browse"
  | "search"
  | "title_details"
  | "chapter_list"
  | "chapter_pages"
  | "downloads";

export type SourceCapabilityMap = Record<SourceCapability, boolean>;

export type SourceTitleStatus = "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown";

export type SourceChapterAvailability = "readable" | "locked" | "unavailable";

export interface SourceMetadata {
  pluginId: string;
  sourceId: string;
  displayName: string;
  language: string;
  baseUrl: string;
}

export interface SourceActions {
  canBrowse: boolean;
  canSearch: boolean;
  canViewTitle: boolean;
  canReadChapters: boolean;
  canDownload: boolean;
}

export interface SourceCatalogItem {
  metadata: SourceMetadata;
  capabilities: SourceCapabilityMap;
  actions: SourceActions;
}

export interface SourceTitleSummary {
  titleId: string;
  slug: string;
  name: string;
  coverUrl: string | null;
  bannerUrl: string | null;
  canonicalUrl: string;
  status: SourceTitleStatus;
  statusLabel: string | null;
  tags: string[];
  latestChapterLabel: string | null;
  descriptionSnippet: string | null;
}

export interface SourceTitleDetails extends SourceTitleSummary {
  description: string | null;
  authors: string[];
  artists: string[];
  originalLanguage: string | null;
  sourceLabel: string | null;
}

export interface SourceChapterSummary {
  chapterId: string;
  title: string;
  chapterNumber: number | null;
  volumeNumber: number | null;
  groupName: string | null;
  releaseDate: string | null;
  canonicalUrl: string;
  availability: SourceChapterAvailability;
  availabilityLabel: string | null;
}

export interface SourceChapterPage {
  pageIndex: number;
  imageUrl: string;
}

export interface SourcePagedResult<T> {
  items: T[];
  page: number;
  hasNextPage: boolean;
}

export interface SourceTitleDetailsResult {
  details: SourceTitleDetails;
  chapters: SourceChapterSummary[];
}

export interface ProjectOverview extends Project {
  chaptersCount: number;
  charactersCount: number;
  generalTermsCount: number;
  contextSummary: string;
  genres: string[];
}

export interface Chapter {
  id: string;
  projectId: string;
  number: string;
  title?: string;
  displayLabel: string;
  status: ChapterStatus;
  internalStatus: ChapterInternalStatus;
  pagesCount: number;
  textUnitsCount: number;
  progress: number;
  updatedAt: string;
}

export interface Page {
  id: string;
  chapterId: string;
  index: number;
  imageTone: string;
  width: number;
  height: number;
}

export interface RegionBox {
  type: "box";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextUnit {
  id: string;
  chapterId: string;
  pageId: string;
  order: number;
  region: RegionBox;
  sourceText: string;
  aiTranslation: string;
  microsoftTranslation: string;
  finalTranslation: string;
  reviewStatus: ReviewStatus;
  matchedCharacterIds: string[];
  matchedGlossaryTermIds: string[];
}

export interface ChapterTranslationWorkspace {
  project: Project;
  chapter: Chapter;
  pages: Page[];
  textUnits: TextUnit[];
  characters: Character[];
  glossaryTerms: GlossaryTerm[];
}

export type ActiveTool =
  | "pan"
  | "select"
  | "ocr"
  | "translate"
  | "review"
  | "typeset"
  | "export";
