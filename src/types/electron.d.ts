import type {
  ChapterTranslationWorkspace,
  ChapterExportResult,
  Character,
  CharacterAlias,
  CharacterInput,
  CreateChapterInput,
  CreateProjectInput,
  GlossaryTermInput,
  GlossaryTerm,
  LibraryStats,
  MergeChapterPagesInput,
  MergeChapterPagesResult,
  OcrProviderStatus,
  OcrRegionRunOptions,
  OcrRunOptions,
  OcrRunResult,
  PageColorSampleInput,
  PageColorSampleResult,
  PageCleanTextInput,
  PageEditMark,
  PageEditMarkInput,
  Project,
  ProjectOverview,
  RemoveMergedPagesResult,
  RestoreCleanPatchAreaInput,
  RestoreCleanPatchAreaResult,
  ChapterTextSizeInput,
  DeleteOcrResultsInput,
  DeleteOcrResultsResult,
  AiTranslationProviderStatus,
  RegionBox,
  SourceCatalogItem,
  SourceChapterPreparationResult,
  SourceChapterPage,
  SourcePagedResult,
  SourceProjectImportResult,
  SourceTitleDetailsResult,
  SourceTitleSummary,
  TextUnit,
  TextComposition,
  TextCompositionUpdateInput,
  TextUnitTypesettingInput,
  TranslateTextUnitsInput,
  TranslateTextUnitsResult,
  TranslateWithAiInput,
  UpdateTextUnitSourceInput,
} from "./domain";

interface FlorisApi {
  listProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  getLibraryStats(): Promise<LibraryStats>;
  getProjectOverview(projectId: string): Promise<ProjectOverview | undefined>;
  listProjectChapters(projectId: string): Promise<import("./domain").Chapter[]>;
  createProjectChapter(
    projectId: string,
    input: CreateChapterInput,
  ): Promise<SourceChapterPreparationResult>;
  pickChapterImages(): Promise<string[]>;
  getProjectDictionary(projectId: string): Promise<{
    characters: Character[];
    glossaryTerms: GlossaryTerm[];
    categories: string[];
  }>;
  getChapterForTranslation(chapterId: string): Promise<ChapterTranslationWorkspace | undefined>;
  prepareLibraryChapter(chapterId: string): Promise<SourceChapterPreparationResult>;
  listOcrProviders(languageHint?: string): Promise<OcrProviderStatus[]>;
  runOcrForPage(pageId: string, input: OcrRunOptions): Promise<OcrRunResult>;
  runOcrForRegion(pageId: string, input: OcrRegionRunOptions): Promise<OcrRunResult>;
  runOcrForChapter(chapterId: string, input: OcrRunOptions): Promise<OcrRunResult>;
  updateTextUnitSource(textUnitId: string, input: UpdateTextUnitSourceInput): Promise<TextUnit>;
  deleteOcrResults(input: DeleteOcrResultsInput): Promise<DeleteOcrResultsResult>;
  updateFinalTranslation(textUnitId: string, text: string): Promise<TextUnit>;
  deleteTextUnit(textUnitId: string): Promise<{ chapterId: string; id: string }>;
  updateTextUnitTypesetting(
    textUnitId: string,
    input: TextUnitTypesettingInput,
  ): Promise<{ box: RegionBox; chapterId: string; color?: string; fontSize: number; id: string }>;
  updateTextComposition(
    compositionId: string,
    input: TextCompositionUpdateInput,
  ): Promise<TextComposition>;
  updateChapterTextSize(
    chapterId: string,
    input: ChapterTextSizeInput,
  ): Promise<{ chapterId: string; delta: number; updated: number }>;
  addPageEditMark(input: PageEditMarkInput): Promise<PageEditMark>;
  deletePageEditMark(markId: string): Promise<{ chapterId: string; id: string; pageId: string }>;
  samplePageColor(pageId: string, input: PageColorSampleInput): Promise<PageColorSampleResult>;
  cleanPageText(pageId: string, input: PageCleanTextInput): Promise<PageEditMark>;
  restoreCleanPatchArea(
    markId: string,
    input: RestoreCleanPatchAreaInput,
  ): Promise<RestoreCleanPatchAreaResult>;
  translateWithMicrosoft(input: TranslateTextUnitsInput): Promise<TranslateTextUnitsResult>;
  listAiTranslationProviders(input?: Partial<TranslateWithAiInput>): Promise<AiTranslationProviderStatus[]>;
  translateWithAi(input: TranslateWithAiInput): Promise<TranslateTextUnitsResult>;
  exportChapter(chapterId: string): Promise<ChapterExportResult>;
  mergeChapterPages(chapterId: string, input: MergeChapterPagesInput): Promise<MergeChapterPagesResult>;
  removeMergedPages(chapterId: string): Promise<RemoveMergedPagesResult>;
  addCharacter(projectId: string, input: CharacterInput): Promise<Character>;
  updateCharacter(
    characterId: string,
    input: CharacterInput,
  ): Promise<Character>;
  deleteCharacter(characterId: string): Promise<{ id: string }>;
  addCharacterAlias(characterId: string, input: Omit<CharacterAlias, "id">): Promise<CharacterAlias>;
  addGlossaryTerm(
    projectId: string,
    input: GlossaryTermInput,
  ): Promise<GlossaryTerm>;
  updateGlossaryTerm(
    termId: string,
    input: GlossaryTermInput,
  ): Promise<GlossaryTerm>;
  deleteGlossaryTerm(termId: string): Promise<{ id: string }>;
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
  ensureSourceProject(sourceId: string, titleId: string): Promise<SourceProjectImportResult>;
  prepareSourceChapter(
    sourceId: string,
    titleId: string,
    chapterId: string,
  ): Promise<SourceChapterPreparationResult>;
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
