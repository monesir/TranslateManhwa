import type {
  CompositionStroke,
  TextComposition,
  TextCompositionKind,
  TextCompositionManualField,
  TextCompositionOrigin,
  TextCompositionSource,
  TextStylePreset,
  TextStylePresetInput,
} from "../text-composition/types";

export type {
  CompositionStroke,
  TextComposition,
  TextCompositionKind,
  TextCompositionManualField,
  TextCompositionOrigin,
  TextCompositionSource,
  TextStylePreset,
  TextStylePresetInput,
} from "../text-composition/types";

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

export type ChapterDownloadStatus =
  | "Not Downloaded"
  | "Downloading"
  | "Downloaded"
  | "Failed";

export type Gender = "Male" | "Female" | "Unknown";

export type ReviewStatus = "Not Reviewed" | "Needs Review" | "Approved";

export type OcrProviderId =
  | "windows"
  | "paddleocr"
  | "tesseract"
  | "easyocr"
  | "rapidocr"
  | "doctr"
  | "manga-ocr";

export type OcrSourceStatus =
  | "Empty"
  | "OCR Ready"
  | "Needs Review"
  | "Reviewed"
  | "Ignored";

export type OcrRunMode = "page" | "region" | "bubble" | "batch";

export interface CharacterAlias {
  id: string;
  english: string;
  arabic: string;
}

export interface CharacterAliasInput {
  id?: string;
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

export interface CharacterInput {
  englishName: string;
  arabicName: string;
  gender: Gender;
  aliases: CharacterAliasInput[];
  description?: string;
}

export interface GlossaryTerm {
  id: string;
  projectId: string;
  englishTerm: string;
  arabicTerm: string;
  category: string;
  description?: string;
}

export type GlossaryTermInput = Omit<GlossaryTerm, "id" | "projectId">;

export interface Project {
  id: string;
  title: string;
  arabicTitle?: string;
  originalTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  coverTone: string;
  coverUrl: string | null;
  status: ProjectStatus;
  lastWorkedChapterId?: string;
  lastWorkedChapterLabel?: string;
  lastModifiedAt: string;
  progress: number;
}

export interface CreateProjectInput {
  title: string;
  originalTitle?: string;
  arabicTitle?: string;
  sourceLanguage: string;
  targetLanguage: string;
  genres: string[];
  description?: string;
  contextSummary?: string;
}

export interface CreateChapterInput {
  number: string;
  title?: string;
  imagePaths: string[];
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
  downloadStatus: ChapterDownloadStatus;
  downloadError?: string;
  downloadedAt?: string;
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
  imageUrl: string | null;
  width: number;
  height: number;
  pageKind?: "original" | "merged";
  mergedGroupId?: string | null;
}

export interface RegionBox {
  type: "box";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageEditPoint {
  x: number;
  y: number;
}

export interface PageEditMark {
  id: string;
  chapterId: string;
  pageId: string;
  kind: "brush" | "clean_patch";
  color?: string;
  classification?: CleanClassificationKind;
  cleanMode?: CleanPatchMode;
  cleanProvider?: CleanProviderId | string;
  cleanSource?: CleanPatchSource;
  confidence?: number | null;
  feather?: number;
  maskExpansion?: number;
  method?: "telea" | "ns";
  metadata?: Record<string, unknown>;
  opacity: number;
  patchUrl?: string;
  points?: PageEditPoint[];
  region?: RegionBox;
  sourceOcrRunId?: string | null;
  sourceTextUnitId?: string | null;
  size?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageEditMarkInput {
  color: string;
  opacity?: number;
  pageId: string;
  points: PageEditPoint[];
  size: number;
}

export interface TextUnitTypesetting {
  box: RegionBox;
  color?: string;
  fontSize: number;
  isExplicit?: boolean;
}

export interface TextUnit {
  id: string;
  chapterId: string;
  pageId: string;
  order: number;
  region: RegionBox;
  sourceText: string;
  sourceStatus: OcrSourceStatus;
  ocrConfidence?: number;
  ocrProvider?: OcrProviderId | string;
  aiTranslation: string;
  microsoftTranslation: string;
  finalTranslation: string;
  reviewStatus: ReviewStatus;
  matchedCharacterIds: string[];
  matchedGlossaryTermIds: string[];
  typesetting: TextUnitTypesetting;
  cleanStatus?: CleanAttemptStatus;
  cleanClassification?: CleanClassificationKind;
  cleanReason?: string;
}

export interface ChapterTranslationWorkspace {
  project: Project;
  chapter: Chapter;
  pages: Page[];
  pageEditMarks: PageEditMark[];
  textCompositions: TextComposition[];
  textStylePresets: TextStylePreset[];
  textUnits: TextUnit[];
  characters: Character[];
  glossaryTerms: GlossaryTerm[];
}

export interface SourceProjectImportResult {
  projectId: string;
  created: boolean;
  chaptersCount: number;
}

export interface SourceChapterPreparationResult {
  projectId: string;
  chapterId: string;
  pagesCount: number;
  chapter: Chapter;
}

export interface OcrProviderStatus {
  id: OcrProviderId;
  label: string;
  engine: string;
  kind: "local";
  supportsRegions: boolean;
  setup: string;
  available: boolean;
  reason?: string | null;
}

export interface OcrRunOptions {
  providerId: OcrProviderId;
  languageHint?: string;
  replaceExisting?: boolean;
  autoCleanText?: boolean;
  autoCleanPolicy?: CleanPolicy;
  autoCleanProvider?: CleanProviderId;
  autoCleanMaskExpansion?: number;
  autoCleanFeather?: number;
  parallelPageWorkers?: number;
}

export interface OcrRegionExpansion {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface OcrRegionRunOptions extends OcrRunOptions {
  expansion: OcrRegionExpansion;
  region: RegionBox;
}

export interface OcrRunResult {
  averageConfidence: number | null;
  candidatesCreated: number;
  chapterId: string;
  cleanErrors?: string[];
  cleanFallbacksApplied?: number;
  cleanPatchesCreated?: number;
  cleanSkipped?: number;
  languageDetected?: string | null;
  pagesProcessed: number;
  provider: OcrProviderId | string;
  runId: string;
  status: "completed" | "failed";
  textUnitsCreated: number;
}

export interface UpdateTextUnitSourceInput {
  sourceText: string;
  sourceStatus: OcrSourceStatus;
}

export interface TextUnitTypesettingInput {
  box?: RegionBox;
  color?: string;
  composition?: TextUnitTypesettingCompositionInput;
  fontSize?: number;
}

export interface TextUnitTypesettingCompositionInput {
  enabled?: boolean;
  kind?: TextCompositionKind;
  manualFields?: TextCompositionManualField[];
  origin?: TextCompositionOrigin | null;
  plainText: string;
  presetId?: string | null;
  source?: TextCompositionSource;
}

export interface TextCompositionUpdateInput {
  box?: RegionBox;
  color?: string;
  fontSize?: number;
  kind?: TextCompositionKind;
  presetId?: string | null;
  resetToPreset?: boolean;
  stroke?: Partial<CompositionStroke>;
}

export type TextStylePresetMutationInput = TextStylePresetInput;

export interface ApplyTextStylePresetInput {
  kind?: TextCompositionKind;
  presetId: string;
}

export interface ApplyTextStylePresetResult {
  chapterId: string;
  kind: TextCompositionKind;
  presetId: string;
  skippedManual: number;
  updated: number;
}

export interface ChapterTextSizeInput {
  delta: number;
}

export interface PageColorSampleInput {
  x: number;
  y: number;
}

export interface PageColorSampleResult {
  color: string;
  engine: string;
  fallbackReason?: string;
  pixelX: number;
  pixelY: number;
}

export interface PageCleanTextInput {
  feather: number;
  maskExpansion: number;
  method: "telea" | "ns";
  region: RegionBox;
  maskRegion?: RegionBox;
  mode?: CleanPatchMode;
  provider?: CleanProviderId;
  source?: CleanPatchSource;
  sourceTextUnitId?: string;
  sourceOcrRunId?: string;
  policy?: CleanPolicy;
}

export interface RestoreCleanPatchAreaInput {
  feather?: number;
  patchRegion?: RegionBox;
  region: RegionBox;
}

export interface RestoreCleanPatchAreaResult {
  changedPixels: number;
  chapterId: string;
  deleted: boolean;
  markId: string;
  pageId: string;
  patch?: PageEditMark;
  restoredRegion: RegionBox;
}

export type CleanProviderId =
  | "algorithm"
  | "bubble_fill"
  | "free_text_inpaint"
  | "opencv_telea"
  | "opencv_ns"
  | "lama"
  | "diffusion";

export type CleanPolicy =
  | "off"
  | "safe_bubbles_only"
  | "ask_on_unsafe"
  | "force_all_regions";

export type CleanClassificationKind =
  | "white_bubble"
  | "black_bubble"
  | "flat_light_box"
  | "flat_dark_box"
  | "textured_background"
  | "effect_text"
  | "unknown"
  | "unsafe";

export type CleanAttemptStatus = "applied" | "failed" | "skipped" | "pending";

export type CleanPatchMode = "auto_after_ocr" | "manual_selection" | "retry";

export type CleanPatchSource =
  | "ocr_page"
  | "ocr_region"
  | "ocr_chapter"
  | "manual_clean";

export interface CleanRegionClassification {
  kind: CleanClassificationKind;
  confidence: number;
  metrics: Record<string, number>;
  reason: string;
}

export interface DeleteOcrResultsInput {
  chapterId: string;
  includeAutoCleanPatches?: boolean;
  keepManualEdits?: boolean;
  pageId?: string;
}

export interface DeleteOcrResultsResult {
  chapterId: string;
  pageId?: string;
  textUnitsDeleted: number;
  candidatesDeleted: number;
  translationCandidatesDeleted: number;
  autoCleanPatchesDeleted: number;
  manualEditsKept: number;
}

export interface TranslateTextUnitsInput {
  scope: "text_unit" | "page" | "chapter";
  textUnitId?: string;
  pageId?: string;
  chapterId: string;
  provider?: "microsoft";
  sourceLanguage?: string;
  targetLanguage?: string;
}

export type TranslationLevel = 1 | 2 | 3 | 4 | 5;

export interface AiTranslationProviderStatus {
  id: string;
  label: string;
  model: string;
  available: boolean;
  activeKeyId?: string | null;
  keyCount?: number;
  reason?: string | null;
  requires?: string | null;
}

export interface TranslateWithAiInput extends Omit<TranslateTextUnitsInput, "provider"> {
  aiProvider?: "openai_compatible" | string;
  applyGlossaryStrictly?: boolean;
  batchSize?: number;
  mode?: "draft" | "revise" | "final";
  model?: string;
  preferConciseBubbleText?: boolean;
  provider?: "ai";
  translationLevel?: TranslationLevel;
}

export interface TranslateTextUnitsResult {
  chapterId: string;
  provider: "microsoft" | string;
  runId: string;
  status: "completed" | "failed";
  translatedCount: number;
  failedCount: number;
  errorMessage?: string;
}

export interface ChapterExportResult {
  chapterId: string;
  files: string[];
  kind: "chapter_pages_png" | string;
  outputPath: string;
  pagesExported: number;
  status: "completed" | "cancelled" | "failed";
}

export interface MergeChapterPagesInput {
  direction?: "vertical" | "horizontal";
  pairSize?: number;
  replaceExisting?: boolean;
}

export interface MergeChapterPagesResult {
  chapterId: string;
  direction: "vertical" | "horizontal";
  mergedPagesCreated: number;
  sourcePagesUsed: number;
}

export interface RemoveMergedPagesResult {
  chapterId: string;
  mergedPagesDeleted: number;
  assetsDeleted: number;
}

export type ActiveTool =
  | "pan"
  | "select"
  | "ocr"
  | "draw"
  | "color-picker"
  | "clean"
  | "restore-clean"
  | "restore-area"
  | "translate"
  | "review"
  | "typeset"
  | "export";
