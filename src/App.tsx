import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Database,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  Gauge,
  Highlighter,
  Image as ImageIcon,
  Languages,
  Layers3,
  Library as LibraryIcon,
  MousePointer2,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReaderPage } from "./pages/ReaderPage";
import {
  addCharacter,
  addGlossaryTerm,
  browseSourceTitles,
  createProjectChapter,
  createProject,
  deleteCharacter,
  deleteGlossaryTerm,
  deleteTextUnit,
  ensureSourceProject,
  getChapterForTranslation,
  getExplorerSeriesDetails,
  getLibraryStats,
  getProjectDictionary,
  getProjectOverview,
  getSourceTitleDetails,
  listOcrProviders,
  listExplorerSeries,
  listProjectChapters,
  listProjects,
  listSourceCatalog,
  pickChapterImages,
  prepareLibraryChapter,
  prepareSourceChapter,
  runOcrForChapter,
  runOcrForPage,
  runOcrForRegion,
  searchSourceTitles,
  updateCharacter,
  updateChapterTextSize,
  updateFinalTranslation,
  updateGlossaryTerm,
  updateTextUnitSource,
  updateTextUnitTypesetting,
} from "./mock/api";
import type {
  ActiveTool,
  Chapter,
  ChapterTranslationWorkspace,
  Character,
  CharacterAliasInput,
  CharacterInput,
  CreateChapterInput,
  CreateProjectInput,
  Gender,
  GlossaryTermInput,
  GlossaryTerm,
  OcrRegionExpansion,
  OcrRegionRunOptions,
  OcrProviderId,
  OcrRunOptions,
  OcrSourceStatus,
  Page,
  Project,
  ProjectOverview,
  RegionBox,
  SourceCatalogItem,
  SourceChapterSummary,
  SourceTitleSummary,
  TextUnit,
  TextUnitTypesettingInput,
} from "./types/domain";
import { useTranslationWorkspaceStore } from "./stores/translation-workspace-store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

const genderOptions: Gender[] = ["Male", "Female", "Unknown"];
const ocrLanguageOptions = [
  ["english", "English"],
  ["", "Auto"],
  ["korean", "Korean"],
  ["japanese", "Japanese"],
  ["chinese", "Chinese"],
  ["arabic", "Arabic"],
] as const;
const sourceStatusOptions: OcrSourceStatus[] = [
  "Needs Review",
  "Reviewed",
  "OCR Ready",
  "Ignored",
  "Empty",
];

interface CharacterFormState {
  englishName: string;
  arabicName: string;
  gender: Gender;
  aliases: CharacterAliasInput[];
  description: string;
}

interface TermFormState {
  englishTerm: string;
  arabicTerm: string;
  category: string;
  description: string;
}

interface CreateProjectFormState {
  title: string;
  originalTitle: string;
  arabicTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
  genres: string;
  description: string;
  contextSummary: string;
}

interface CreateChapterFormState {
  number: string;
  title: string;
  imagePaths: string[];
}

interface OcrSelectionState {
  pageId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type TextBoxDragMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";

interface TextBoxDragState {
  currentBox: RegionBox;
  mode: TextBoxDragMode;
  page: Page;
  startBox: RegionBox;
  startClientX: number;
  startClientY: number;
  textUnitId: string;
  zoom: number;
}

interface TextBoxDraftState {
  box: RegionBox;
  textUnitId: string;
}

function normalizeSelectionRegion(selection: OcrSelectionState | null): RegionBox | null {
  if (!selection) return null;
  const x = Math.min(selection.startX, selection.currentX);
  const y = Math.min(selection.startY, selection.currentY);
  const width = Math.abs(selection.currentX - selection.startX);
  const height = Math.abs(selection.currentY - selection.startY);
  if (width < 4 || height < 4) return null;
  return {
    type: "box",
    x,
    y,
    width,
    height,
  };
}

function normalizeDictionarySearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dictionaryTextIncludes(haystack: string, needle: string) {
  const normalizedNeedle = normalizeDictionarySearchText(needle);
  if (normalizedNeedle.length < 2) return false;
  return normalizeDictionarySearchText(haystack).includes(normalizedNeedle);
}

function dictionaryTextForUnit(unit?: TextUnit) {
  if (!unit) return "";
  return [
    unit.sourceText,
    unit.finalTranslation,
    unit.aiTranslation,
    unit.microsoftTranslation,
  ].join("\n");
}

function characterMatchesText(character: Character, text: string) {
  return [
    character.englishName,
    character.arabicName,
    ...character.aliases.flatMap((alias) => [alias.english, alias.arabic]),
  ].some((value) => dictionaryTextIncludes(text, value));
}

function glossaryTermMatchesText(term: GlossaryTerm, text: string) {
  return [term.englishTerm, term.arabicTerm].some((value) => dictionaryTextIncludes(text, value));
}

const DEFAULT_OCR_REGION_EXPANSION: OcrRegionExpansion = {
  bottom: 30,
  left: 48,
  right: 96,
  top: 30,
};
const MIN_TEXT_UNIT_FONT_SIZE = 8;
const MAX_TEXT_UNIT_FONT_SIZE = 72;
const TEXT_UNIT_FONT_STEP = 2;
const MIN_TEXT_BOX_WIDTH = 16;
const MIN_TEXT_BOX_HEIGHT = 12;

function clampTextUnitFontSize(value: number) {
  if (!Number.isFinite(value)) return 18;
  return Math.max(MIN_TEXT_UNIT_FONT_SIZE, Math.min(MAX_TEXT_UNIT_FONT_SIZE, Math.round(value)));
}

function clampTextBoxToPage(box: RegionBox, page: Page): RegionBox {
  const width = Math.min(Math.max(MIN_TEXT_BOX_WIDTH, box.width), page.width);
  const height = Math.min(Math.max(MIN_TEXT_BOX_HEIGHT, box.height), page.height);
  return {
    type: "box",
    x: Math.max(0, Math.min(box.x, page.width - width)),
    y: Math.max(0, Math.min(box.y, page.height - height)),
    width,
    height,
  };
}

function transformTextBox(
  mode: TextBoxDragMode,
  startBox: RegionBox,
  deltaX: number,
  deltaY: number,
  page: Page,
): RegionBox {
  if (mode === "move") {
    return clampTextBoxToPage({
      ...startBox,
      x: startBox.x + deltaX,
      y: startBox.y + deltaY,
    }, page);
  }

  let left = startBox.x;
  let top = startBox.y;
  let right = startBox.x + startBox.width;
  let bottom = startBox.y + startBox.height;

  if (mode.includes("w")) left += deltaX;
  if (mode.includes("e")) right += deltaX;
  if (mode.includes("n")) top += deltaY;
  if (mode.includes("s")) bottom += deltaY;

  left = Math.max(0, Math.min(left, page.width - MIN_TEXT_BOX_WIDTH));
  top = Math.max(0, Math.min(top, page.height - MIN_TEXT_BOX_HEIGHT));
  right = Math.max(MIN_TEXT_BOX_WIDTH, Math.min(right, page.width));
  bottom = Math.max(MIN_TEXT_BOX_HEIGHT, Math.min(bottom, page.height));

  if (right - left < MIN_TEXT_BOX_WIDTH) {
    if (mode.includes("w")) left = right - MIN_TEXT_BOX_WIDTH;
    else right = left + MIN_TEXT_BOX_WIDTH;
  }
  if (bottom - top < MIN_TEXT_BOX_HEIGHT) {
    if (mode.includes("n")) top = bottom - MIN_TEXT_BOX_HEIGHT;
    else bottom = top + MIN_TEXT_BOX_HEIGHT;
  }

  return clampTextBoxToPage({
    type: "box",
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, page);
}

function defaultCreateProjectForm(): CreateProjectFormState {
  return {
    title: "",
    originalTitle: "",
    arabicTitle: "",
    sourceLanguage: "English",
    targetLanguage: "Arabic",
    genres: "",
    description: "",
    contextSummary: "",
  };
}

function defaultCreateChapterForm(): CreateChapterFormState {
  return {
    number: "",
    title: "",
    imagePaths: [],
  };
}

function fileNameFromPath(value: string) {
  return value.split(/[\\/]/).pop() ?? value;
}

function createEmptyCharacterForm(): CharacterFormState {
  return {
    englishName: "",
    arabicName: "",
    gender: "Unknown",
    aliases: [],
    description: "",
  };
}

function characterToForm(character: Character): CharacterFormState {
  return {
    englishName: character.englishName,
    arabicName: character.arabicName,
    gender: character.gender,
    aliases: character.aliases.map((alias) => ({ ...alias })),
    description: character.description ?? "",
  };
}

function createEmptyTermForm(): TermFormState {
  return {
    englishTerm: "",
    arabicTerm: "",
    category: "General Term",
    description: "",
  };
}

function termToForm(term: GlossaryTerm): TermFormState {
  return {
    englishTerm: term.englishTerm,
    arabicTerm: term.arabicTerm,
    category: term.category,
    description: term.description ?? "",
  };
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isRenderableImageUrl(value: string | null | undefined) {
  return Boolean(value && /^(https?:|file:|data:|floris-cache:)/.test(value));
}

function CoverArt({ tone, title }: { tone: string; title: string }) {
  const letters = title
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className={`cover-art tone-${tone}`} aria-label={`${title} cover`}>
      <div className="cover-grid" />
      <div className="cover-letters">{letters}</div>
    </div>
  );
}

function sourceTone(value: string) {
  const tones = ["ember", "teal", "violet", "steel"];
  const total = value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[total % tones.length];
}

function coverFallbackText(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function SourceCover({ imageUrl, title }: { imageUrl: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return <CoverArt tone={sourceTone(title)} title={title} />;
  }

  return (
    <div className="source-cover">
      <img loading="lazy" src={imageUrl} alt={`${title} cover`} onError={() => setFailed(true)} />
    </div>
  );
}

function ProjectCover({ project }: { project: Project }) {
  return <SourceCover imageUrl={project.coverUrl} title={project.title} />;
}

function FloirsCoverImage({ imageUrl, title }: { imageUrl: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return <div className="floirs-cover-card__fallback">{coverFallbackText(title) || "No cover"}</div>;
  }

  return (
    <img
      className="floirs-cover-card__image"
      loading="lazy"
      src={imageUrl}
      alt={title}
      onError={() => setFailed(true)}
    />
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" aria-label={`Progress ${value}%`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-panel">
      <RefreshCw className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="state-panel">
      <FileText size={20} />
      <span>{label}</span>
    </div>
  );
}

function sourceExplorerPath(sourceId: string) {
  return `/explorer?source=${encodeURIComponent(sourceId)}`;
}

function SidebarGroupButton({
  active,
  expanded,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  expanded: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "sidebar-nav-item sidebar-nav-item--button active" : "sidebar-nav-item sidebar-nav-item--button"}
      onClick={onClick}
    >
      <span className="sidebar-nav-item__main">
        <span className="sidebar-nav-item__icon">{icon}</span>
        <span>{label}</span>
      </span>
      <span className="sidebar-nav-item__chevron">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </span>
    </button>
  );
}

function SidebarSubLink({
  active,
  children,
  to,
}: {
  active?: boolean;
  children: ReactNode;
  to: string;
}) {
  return (
    <Link className={active ? "sidebar-subnav-item active" : "sidebar-subnav-item"} to={to}>
      {children}
    </Link>
  );
}

function AppShell() {
  const runtimeLabel = window.florisApi ? "Electron runtime" : "Local UI build";
  const dataLabel = window.florisApi ? "SQLite data" : "No SQLite connection";
  const location = useLocation();
  const navigate = useNavigate();
  const [libraryExpanded, setLibraryExpanded] = useState(true);
  const [explorerExpanded, setExplorerExpanded] = useState(true);
  const catalogQuery = useQuery({
    queryKey: ["source-catalog"],
    queryFn: listSourceCatalog,
    staleTime: 5 * 60_000,
  });
  const sources = catalogQuery.data ?? [];
  const isLibraryView = location.pathname === "/library" || location.pathname.startsWith("/projects");
  const isExplorerView = location.pathname.startsWith("/explorer");
  const isSettingsView = location.pathname === "/settings";
  const isTranslationView = /^\/projects\/[^/]+\/chapters\/[^/]+\/translate$/.test(location.pathname);
  const explorerPathParts = location.pathname.split("/").filter(Boolean);
  const querySourceId = new URLSearchParams(location.search).get("source");
  const activeExplorerSourceId =
    explorerPathParts[0] === "explorer" && explorerPathParts.length >= 3
      ? decodeURIComponent(explorerPathParts[1])
      : querySourceId;

  useEffect(() => {
    if (isLibraryView) setLibraryExpanded(true);
    if (isExplorerView) setExplorerExpanded(true);
  }, [isExplorerView, isLibraryView]);

  return (
    <div className={isTranslationView ? "app-shell app-shell--translation" : "app-shell"}>
      {isTranslationView ? null : (
        <aside className="app-sidebar">
          <div className="sidebar-scroll">
            <div className="sidebar-group">
              <SidebarGroupButton
                active={isLibraryView}
                expanded={libraryExpanded}
                icon={<LibraryIcon size={18} />}
                label="Library"
                onClick={() => {
                  navigate("/library");
                  setLibraryExpanded((value) => !value);
                }}
              />
              {libraryExpanded ? (
                <div className="sidebar-subnav">
                  <SidebarSubLink active={location.pathname === "/library"} to="/library">
                    All Projects
                  </SidebarSubLink>
                </div>
              ) : null}
            </div>

            <div className="sidebar-group">
              <SidebarGroupButton
                active={isExplorerView}
                expanded={explorerExpanded}
                icon={<Compass size={18} />}
                label="Explorer"
                onClick={() => {
                  navigate(activeExplorerSourceId ? sourceExplorerPath(activeExplorerSourceId) : "/explorer");
                  setExplorerExpanded((value) => !value);
                }}
              />
              {explorerExpanded ? (
                <div className="sidebar-subnav">
                  {sources.map((source: SourceCatalogItem) => {
                    const sourceId = source.metadata.sourceId;
                    return (
                      <SidebarSubLink
                        active={isExplorerView && activeExplorerSourceId === sourceId}
                        key={sourceId}
                        to={sourceExplorerPath(sourceId)}
                      >
                        {source.metadata.displayName}
                      </SidebarSubLink>
                    );
                  })}
                  {sources.length === 0 ? (
                    <SidebarSubLink active={isExplorerView && !activeExplorerSourceId} to="/explorer">
                      All Sources
                    </SidebarSubLink>
                  ) : null}
                </div>
              ) : null}
            </div>

            <NavLink
              className={({ isActive }) =>
                isActive || isSettingsView ? "sidebar-nav-item active" : "sidebar-nav-item"
              }
              to="/settings"
            >
              <span className="sidebar-nav-item__icon">
                <Settings size={18} />
              </span>
              <span>Settings</span>
            </NavLink>
          </div>

          <div className="sidebar-status">
            <span>{runtimeLabel}</span>
            <strong>{dataLabel}</strong>
          </div>
        </aside>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route
            path="/explorer/:sourceId/:titleId/chapters/:chapterId/read"
            element={<ReaderPage />}
          />
          <Route path="/explorer/:sourceId/:titleId" element={<ExplorerDetailsPage />} />
          <Route path="/explorer/:externalSeriesId" element={<ExplorerDetailsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route
            path="/projects/:projectId/chapters/:chapterId/translate"
            element={<TranslationPage />}
          />
          <Route path="/projects/:projectId/chapters/:chapterId/read" element={<ReaderPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function LibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<CreateProjectFormState>(
    defaultCreateProjectForm,
  );
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const statsQuery = useQuery({ queryKey: ["library-stats"], queryFn: getLibraryStats });
  const createProjectMutation = useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["library-stats"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", project.id] });
      setProjectForm(defaultCreateProjectForm());
      setIsCreateProjectOpen(false);
      navigate(`/projects/${project.id}`);
    },
  });

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = projectForm.title.trim();
    if (!title) return;

    createProjectMutation.mutate({
      title,
      originalTitle: projectForm.originalTitle.trim() || title,
      arabicTitle: projectForm.arabicTitle.trim() || undefined,
      sourceLanguage: projectForm.sourceLanguage.trim() || "English",
      targetLanguage: projectForm.targetLanguage.trim() || "Arabic",
      genres: projectForm.genres
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean),
      description: projectForm.description.trim() || undefined,
      contextSummary: projectForm.contextSummary.trim() || undefined,
    });
  }

  if (projectsQuery.isLoading || statsQuery.isLoading) {
    return <LoadingPanel label="Loading library" />;
  }

  const projects = projectsQuery.data ?? [];
  const stats = statsQuery.data;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Library</h1>
        </div>
        <div className="header-actions">
          <button className="button secondary">
            <Filter size={16} />
            Filter
          </button>
          <button className="button primary" onClick={() => setIsCreateProjectOpen(true)}>
            <Plus size={16} />
            New project
          </button>
        </div>
      </header>

      {stats ? (
        <div className="stats-strip">
          <StatCard label="Last worked chapter" value={stats.lastWorkedChapter} icon={<BookOpen />} />
          <StatCard label="Last modified" value={formatDate(stats.lastModifiedAt)} icon={<Save />} />
          <StatCard label="Active projects" value={String(stats.activeProjects)} icon={<LibraryIcon />} />
          <StatCard
            label="Chapters in progress"
            value={String(stats.chaptersInProgress)}
            icon={<Gauge />}
          />
          <StatCard
            label="Completed chapters"
            value={String(stats.completedChapters)}
            icon={<CheckCircle2 />}
          />
        </div>
      ) : null}

      <div className="project-grid">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {isCreateProjectOpen ? (
        <CreateProjectDialog
          error={
            createProjectMutation.error instanceof Error
              ? createProjectMutation.error.message
              : null
          }
          form={projectForm}
          isSaving={createProjectMutation.isPending}
          onChange={setProjectForm}
          onClose={() => {
            if (!createProjectMutation.isPending) {
              setIsCreateProjectOpen(false);
            }
          }}
          onSubmit={submitProject}
        />
      ) : null}
    </section>
  );
}

function CreateProjectDialog({
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  error: string | null;
  form: CreateProjectFormState;
  isSaving: boolean;
  onChange: (form: CreateProjectFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal-card create-project-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Library</p>
            <h2>New project</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="editor-grid create-project-grid">
          <label className="form-field">
            <span>Project name</span>
            <input
              autoFocus
              required
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Original title</span>
            <input
              value={form.originalTitle}
              onChange={(event) => onChange({ ...form, originalTitle: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Arabic title</span>
            <input
              dir="rtl"
              value={form.arabicTitle}
              onChange={(event) => onChange({ ...form, arabicTitle: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Source language</span>
            <input
              value={form.sourceLanguage}
              onChange={(event) => onChange({ ...form, sourceLanguage: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Target language</span>
            <input
              value={form.targetLanguage}
              onChange={(event) => onChange({ ...form, targetLanguage: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Genres</span>
            <input
              placeholder="Action, Fantasy"
              value={form.genres}
              onChange={(event) => onChange({ ...form, genres: event.target.value })}
            />
          </label>
          <label className="form-field full">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
            />
          </label>
          <label className="form-field full">
            <span>Work context</span>
            <textarea
              value={form.contextSummary}
              onChange={(event) => onChange({ ...form, contextSummary: event.target.value })}
            />
          </label>
        </div>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="form-actions">
          <button className="button primary" disabled={isSaving} type="submit">
            <Save size={16} />
            {isSaving ? "Creating" : "Create project"}
          </button>
          <button className="button secondary" disabled={isSaving} onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link className="project-card" to={`/projects/${project.id}`}>
      <ProjectCover project={project} />
      <div className="project-card-body">
        <div className="project-card-title">
          <div>
            <h2>{project.title}</h2>
            <p>{project.originalTitle}</p>
          </div>
          <span className={`status-chip ${statusClass(project.status)}`}>{project.status}</span>
        </div>
        <div className="meta-grid">
          <span>Last chapter</span>
          <strong>{project.lastWorkedChapterLabel ?? "None"}</strong>
          <span>Last modified</span>
          <strong>{formatDate(project.lastModifiedAt)}</strong>
          <span>Language</span>
          <strong>{project.sourceLanguage}</strong>
        </div>
        <div className="project-progress">
          <ProgressBar value={project.progress} />
          <span>{project.progress}%</span>
        </div>
      </div>
    </Link>
  );
}

function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const sourceParam = searchParams.get("source") ?? "";
  const [selectedSourceId, setSelectedSourceId] = useState<string>(sourceParam);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim();

  const catalogQuery = useQuery({ queryKey: ["source-catalog"], queryFn: listSourceCatalog });
  const sources = catalogQuery.data ?? [];

  useEffect(() => {
    if (sourceParam && sourceParam !== selectedSourceId) {
      setSelectedSourceId(sourceParam);
    }
  }, [selectedSourceId, sourceParam]);

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      const fallbackSourceId = sources[0].metadata.sourceId;
      setSelectedSourceId(fallbackSourceId);
      setSearchParams({ source: fallbackSourceId }, { replace: true });
    }
  }, [selectedSourceId, setSearchParams, sources]);

  function selectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    setSearchParams({ source: sourceId }, { replace: true });
  }

  const titlesQuery = useInfiniteQuery({
    queryKey: ["source-titles", selectedSourceId, normalizedQuery],
    enabled: Boolean(selectedSourceId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const page = Number(pageParam);
      return normalizedQuery
        ? searchSourceTitles(selectedSourceId, normalizedQuery, page)
        : browseSourceTitles(selectedSourceId, page);
    },
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    staleTime: 60_000,
  });

  const titles = useMemo(() => {
    const seen = new Set<string>();
    const rows: SourceTitleSummary[] = [];

    for (const item of titlesQuery.data?.pages.flatMap((page) => page.items) ?? []) {
      const key = `${selectedSourceId}:${item.titleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
    }

    return rows;
  }, [selectedSourceId, titlesQuery.data]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && titlesQuery.hasNextPage && !titlesQuery.isFetchingNextPage) {
          void titlesQuery.fetchNextPage();
        }
      },
      { rootMargin: "700px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [titlesQuery.hasNextPage, titlesQuery.isFetchingNextPage, titlesQuery.fetchNextPage]);

  const activeSource = sources.find((source) => source.metadata.sourceId === selectedSourceId);
  const isInitialLoading =
    catalogQuery.isLoading || (Boolean(selectedSourceId) && titlesQuery.isLoading);
  const hasError = catalogQuery.isError || titlesQuery.isError;
  const errorMessage =
    catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : titlesQuery.error instanceof Error
        ? titlesQuery.error.message
        : "Explorer source failed";

  const legacySeriesQuery = useQuery({
    queryKey: ["explorer-legacy"],
    queryFn: listExplorerSeries,
    enabled: !window.florisApi && !catalogQuery.isLoading && sources.length === 0,
  });
  const legacySeries = (legacySeriesQuery.data ?? []).filter((item) =>
    `${item.title} ${item.originalTitle}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1>Explorer</h1>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search series" />
        </div>
      </header>

      <div className="source-strip">
        {sources.map((source) => (
          <button
            className={source.metadata.sourceId === selectedSourceId ? "source-tab active" : "source-tab"}
            key={source.metadata.sourceId}
            onClick={() => selectSource(source.metadata.sourceId)}
          >
            {source.metadata.displayName}
          </button>
        ))}
        {sources.length === 0 && !catalogQuery.isLoading ? (
          <button className="source-tab active">No sources</button>
        ) : null}
      </div>

      {activeSource ? (
        <div className="explorer-status-line">
          <span>{activeSource.metadata.displayName}</span>
          <strong>{titles.length} loaded</strong>
          {titlesQuery.hasNextPage ? <em>Lazy loading enabled</em> : <em>End of source results</em>}
        </div>
      ) : null}

      {isInitialLoading ? <LoadingPanel label="Loading explorer" /> : null}
      {hasError ? <EmptyPanel label={errorMessage} /> : null}
      {!isInitialLoading && !hasError && sources.length > 0 && titles.length === 0 ? (
        <EmptyPanel label="No series found" />
      ) : null}

      {sources.length > 0 ? (
        <>
          <div className="explorer-grid">
            {titles.map((item) => (
              <SourceSeriesCard key={`${selectedSourceId}:${item.titleId}`} item={item} sourceId={selectedSourceId} />
            ))}
          </div>
          <div ref={sentinelRef} className="lazy-load-sentinel">
            {titlesQuery.isFetchingNextPage ? (
              <>
                <RefreshCw className="spin" size={16} />
                <span>Loading more series</span>
              </>
            ) : titlesQuery.hasNextPage ? (
              <span>Scroll for more</span>
            ) : titles.length > 0 ? (
              <span>No more results</span>
            ) : null}
          </div>
        </>
      ) : null}

      {sources.length === 0 && legacySeries.length > 0 ? (
        <div className="explorer-grid">
          {legacySeries.map((item) => (
            <Link
              className="floirs-cover-card floirs-cover-card--browse"
              key={item.externalSeriesId}
              to={`/explorer/${item.externalSeriesId}`}
            >
              <div className={`floirs-cover-card__media tone-${item.coverTone}`}>
                <div className="floirs-cover-card__fallback">{coverFallbackText(item.title)}</div>
                <div className="floirs-cover-card__overlay">
                  <div className="floirs-cover-card__title" title={item.title}>
                    {item.title}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SourceSeriesCard({ item, sourceId }: { item: SourceTitleSummary; sourceId: string }) {
  return (
    <Link
      className="floirs-cover-card floirs-cover-card--browse"
      to={`/explorer/${encodeURIComponent(sourceId)}/${encodeURIComponent(item.titleId)}`}
    >
      <div className="floirs-cover-card__media">
        <FloirsCoverImage imageUrl={item.coverUrl} title={item.name} />
        <div className="floirs-cover-card__overlay">
          <div className="floirs-cover-card__title" title={item.name}>
            {item.name}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ExplorerDetailsPage() {
  const { sourceId, titleId, externalSeriesId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sourceDetailsQuery = useQuery({
    queryKey: ["source-title-details", sourceId, titleId],
    queryFn: () => getSourceTitleDetails(sourceId ?? "", titleId ?? ""),
    enabled: Boolean(sourceId && titleId),
  });
  const legacyDetailsQuery = useQuery({
    queryKey: ["explorer-details", externalSeriesId],
    queryFn: () => getExplorerSeriesDetails(externalSeriesId ?? ""),
    enabled: !sourceId && Boolean(externalSeriesId),
  });
  const addSourceProjectMutation = useMutation({
    mutationFn: () => ensureSourceProject(sourceId ?? "", titleId ?? ""),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["library-stats"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", result.projectId] });
      navigate(`/projects/${result.projectId}`);
    },
  });
  const prepareChapterMutation = useMutation({
    mutationFn: (chapterId: string) => prepareSourceChapter(sourceId ?? "", titleId ?? "", chapterId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["library-stats"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      navigate(`/projects/${result.projectId}/chapters/${result.chapterId}/translate`);
    },
  });

  if (sourceId && titleId) {
    const sourceResult = sourceDetailsQuery.data;
    if (sourceDetailsQuery.isLoading) return <LoadingPanel label="Loading series" />;
    if (sourceDetailsQuery.isError) {
      const message =
        sourceDetailsQuery.error instanceof Error ? sourceDetailsQuery.error.message : "Series not found";
      return <EmptyPanel label={message} />;
    }
    if (!sourceResult) return <EmptyPanel label="Series not found" />;

    return (
      <section className="page">
        <button className="inline-back" onClick={() => navigate("/explorer")}>
          <ArrowLeft size={16} />
          Back to Explorer
        </button>

        <div className="details-layout">
          <SourceCover imageUrl={sourceResult.details.coverUrl} title={sourceResult.details.name} />
          <div className="details-main">
            <p className="eyebrow">{sourceResult.details.sourceLabel ?? sourceId}</p>
            <h1>{sourceResult.details.name}</h1>
            <p className="muted">{sourceResult.details.originalLanguage ?? "Unknown original type"}</p>
            <p className="description">{sourceResult.details.description ?? "No description available."}</p>
            <div className="tag-row">
              {sourceResult.details.tags.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
            <div className="details-actions">
              <button
                className="button primary"
                disabled={addSourceProjectMutation.isPending}
                onClick={() => addSourceProjectMutation.mutate()}
              >
                <Plus size={16} />
                {addSourceProjectMutation.isPending ? "Adding" : "Add to Library"}
              </button>
              <a className="button secondary" href={sourceResult.details.canonicalUrl} target="_blank" rel="noreferrer">
                <Compass size={16} />
                Open source
              </a>
            </div>
            {addSourceProjectMutation.isError ? (
              <p className="error-line">
                {addSourceProjectMutation.error instanceof Error
                  ? addSourceProjectMutation.error.message
                  : "Could not add series to library"}
              </p>
            ) : null}
            {prepareChapterMutation.isError ? (
              <p className="error-line">
                {prepareChapterMutation.error instanceof Error
                  ? prepareChapterMutation.error.message
                  : "Could not download chapter"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="table-card">
          <div className="table-title">
            <h2>Chapters</h2>
            <span>{sourceResult.chapters.length} listed</span>
          </div>
          <div className="chapter-list compact source-chapters">
            {sourceResult.chapters.map((chapter) => (
              <SourceChapterRow
                chapter={chapter}
                key={chapter.chapterId}
                isDownloading={
                  prepareChapterMutation.isPending &&
                  prepareChapterMutation.variables === chapter.chapterId
                }
                onDownload={() => prepareChapterMutation.mutate(chapter.chapterId)}
                onRead={() =>
                  navigate(
                    `/explorer/${encodeURIComponent(sourceId)}/${encodeURIComponent(titleId)}/chapters/${encodeURIComponent(chapter.chapterId)}/read`,
                  )
                }
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const details = legacyDetailsQuery.data;
  if (legacyDetailsQuery.isLoading) return <LoadingPanel label="Loading series" />;
  if (!details) return <EmptyPanel label="Series not found" />;

  return (
    <section className="page">
      <button className="inline-back" onClick={() => navigate("/explorer")}>
        <ArrowLeft size={16} />
        Back to Explorer
      </button>

      <div className="details-layout">
        <CoverArt tone={details.coverTone} title={details.title} />
        <div className="details-main">
          <p className="eyebrow">{details.sourceName}</p>
          <h1>{details.title}</h1>
          <p className="muted">{details.originalTitle}</p>
          <p className="description">{details.description}</p>
          <div className="tag-row">
            {details.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div className="details-actions">
            <button className="button primary">
              <Plus size={16} />
              Add to Library
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-title">
          <h2>Chapters</h2>
          <span>{details.chapters.length} listed</span>
        </div>
        <div className="chapter-list compact">
          {details.chapters.map((chapter) => (
            <div className="chapter-row" key={chapter.id}>
              <strong>{chapter.label}</strong>
              <span>{chapter.title ?? "Untitled"}</span>
              <span>{chapter.date}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourceChapterRow({
  chapter,
  isDownloading,
  onDownload,
  onRead,
}: {
  chapter: SourceChapterSummary;
  isDownloading: boolean;
  onDownload: () => void;
  onRead: () => void;
}) {
  const isReadable = chapter.availability === "readable";

  return (
    <div
      className={isReadable ? "chapter-row chapter-row-button source-chapter-row" : "chapter-row chapter-row-button source-chapter-row is-disabled"}
      role="button"
      tabIndex={isReadable ? 0 : -1}
      onClick={() => {
        if (isReadable) onRead();
      }}
      onKeyDown={(event) => {
        if (!isReadable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRead();
        }
      }}
    >
      <strong>{chapter.chapterNumber == null ? "Chapter" : `Chapter ${chapter.chapterNumber}`}</strong>
      <span>{chapter.title || "Untitled"}</span>
      <span className={`status-chip ${statusClass(chapter.availability)}`}>
        {chapter.availabilityLabel ?? chapter.availability}
      </span>
      <button
        className="icon-button source-download-button"
        disabled={!isReadable || isDownloading}
        onClick={(event) => {
          event.stopPropagation();
          onDownload();
        }}
        title="Download chapter for translation"
        type="button"
      >
        {isDownloading ? <RefreshCw className="spin" size={15} /> : <Download size={15} />}
      </button>
    </div>
  );
}

function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const requestedTab =
    tabParam === "overview" || tabParam === "dictionary" || tabParam === "chapters" ? tabParam : "chapters";
  const [tab, setTab] = useState<"overview" | "chapters" | "dictionary">(requestedTab);
  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId ?? ""),
  });

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  const selectTab = (nextTab: "overview" | "chapters" | "dictionary") => {
    setTab(nextTab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      if (nextTab !== "dictionary") next.delete("section");
      return next;
    }, { replace: true });
  };

  const overview = overviewQuery.data;
  if (overviewQuery.isLoading) return <LoadingPanel label="Loading project" />;
  if (!overview) return <EmptyPanel label="Project not found" />;

  return (
    <section className="page">
      <button className="inline-back" onClick={() => navigate("/library")}>
        <ArrowLeft size={16} />
        Back to Library
      </button>

      <header className="project-hero">
        <SourceCover imageUrl={overview.coverUrl} title={overview.title} />
        <div>
          <p className="eyebrow">{overview.sourceLanguage} to {overview.targetLanguage}</p>
          <h1>{overview.title}</h1>
          <p className="muted">{overview.originalTitle}</p>
          <div className="tag-row">
            {overview.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
        </div>
      </header>

      <div className="tabs">
        <button className={tab === "chapters" ? "active" : ""} onClick={() => selectTab("chapters")}>
          Chapters
        </button>
        <button className={tab === "dictionary" ? "active" : ""} onClick={() => selectTab("dictionary")}>
          Dictionary
        </button>
        <button className={tab === "overview" ? "active" : ""} onClick={() => selectTab("overview")}>
          Overview
        </button>
      </div>

      {tab === "chapters" ? <ChaptersTab projectId={overview.id} /> : null}
      {tab === "dictionary" ? <DictionaryTab projectId={overview.id} /> : null}
      {tab === "overview" ? <OverviewTab overview={overview} /> : null}
    </section>
  );
}

function OverviewTab({ overview }: { overview: ProjectOverview }) {
  return (
    <div className="overview-grid">
      <div className="metric-card">
        <span>Chapters</span>
        <strong>{overview.chaptersCount}</strong>
      </div>
      <div className="metric-card">
        <span>Characters</span>
        <strong>{overview.charactersCount}</strong>
      </div>
      <div className="metric-card">
        <span>General terms</span>
        <strong>{overview.generalTermsCount}</strong>
      </div>
      <div className="metric-card">
        <span>Last modified</span>
        <strong>{formatDate(overview.lastModifiedAt)}</strong>
      </div>
      <div className="context-panel">
        <h2>Work Context</h2>
        <p>{overview.contextSummary}</p>
      </div>
      <div className="context-panel">
        <h2>Progress</h2>
        <ProgressBar value={overview.progress} />
        <p>{overview.progress}% of the active project workflow is complete.</p>
      </div>
    </div>
  );
}

function ChaptersTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateChapterOpen, setIsCreateChapterOpen] = useState(false);
  const [chapterForm, setChapterForm] = useState<CreateChapterFormState>(
    defaultCreateChapterForm,
  );
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  const chaptersQuery = useQuery({
    queryKey: ["project-chapters", projectId],
    queryFn: () => listProjectChapters(projectId),
  });
  const createChapterMutation = useMutation({
    mutationFn: (input: CreateChapterInput) => createProjectChapter(projectId, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["library-stats"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      setChapterForm(defaultCreateChapterForm());
      setImagePickerError(null);
      setIsCreateChapterOpen(false);
      navigate(`/projects/${result.projectId}/chapters/${result.chapterId}/translate`);
    },
  });
  const prepareChapterMutation = useMutation({
    mutationFn: (chapterId: string) => prepareLibraryChapter(chapterId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["library-stats"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", result.projectId] });
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      navigate(`/projects/${result.projectId}/chapters/${result.chapterId}/translate`);
    },
  });

  async function chooseChapterImages() {
    setImagePickerError(null);
    try {
      const imagePaths = await pickChapterImages();
      if (imagePaths.length > 0) {
        setChapterForm((current) => ({ ...current, imagePaths }));
      }
    } catch (error) {
      setImagePickerError(error instanceof Error ? error.message : "Could not choose images");
    }
  }

  function submitChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = chapterForm.number.trim();
    if (!number || chapterForm.imagePaths.length === 0) return;

    createChapterMutation.mutate({
      number,
      title: chapterForm.title.trim() || undefined,
      imagePaths: chapterForm.imagePaths,
    });
  }

  if (chaptersQuery.isLoading) return <LoadingPanel label="Loading chapters" />;
  const rows = chaptersQuery.data ?? [];

  return (
    <div className="table-card">
      <div className="table-title">
        <div>
          <h2>Chapters</h2>
          <span>{rows.length} chapters</span>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => setIsCreateChapterOpen(true)}
        >
          <Plus size={16} />
          Add chapter
        </button>
      </div>
      {prepareChapterMutation.isError ? (
        <p className="error-line">
          {prepareChapterMutation.error instanceof Error
            ? prepareChapterMutation.error.message
            : "Could not download chapter"}
        </p>
      ) : null}
      <div className="chapter-list">
        {rows.map((chapter) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            isPreparing={
              prepareChapterMutation.isPending &&
              prepareChapterMutation.variables === chapter.id
            }
            onOpen={() => prepareChapterMutation.mutate(chapter.id)}
          />
        ))}
      </div>
      {isCreateChapterOpen ? (
        <CreateChapterDialog
          error={
            createChapterMutation.error instanceof Error
              ? createChapterMutation.error.message
              : null
          }
          form={chapterForm}
          imagePickerError={imagePickerError}
          isSaving={createChapterMutation.isPending}
          onChange={setChapterForm}
          onChooseImages={chooseChapterImages}
          onClose={() => {
            if (!createChapterMutation.isPending) {
              setImagePickerError(null);
              setIsCreateChapterOpen(false);
            }
          }}
          onSubmit={submitChapter}
        />
      ) : null}
    </div>
  );
}

function CreateChapterDialog({
  error,
  form,
  imagePickerError,
  isSaving,
  onChange,
  onChooseImages,
  onClose,
  onSubmit,
}: {
  error: string | null;
  form: CreateChapterFormState;
  imagePickerError: string | null;
  isSaving: boolean;
  onChange: (form: CreateChapterFormState) => void;
  onChooseImages: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedPreview = form.imagePaths.slice(0, 10);
  const remainingCount = Math.max(0, form.imagePaths.length - selectedPreview.length);
  const canSubmit = form.number.trim().length > 0 && form.imagePaths.length > 0 && !isSaving;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal-card create-chapter-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Add chapter</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="editor-grid create-chapter-grid">
          <label className="form-field">
            <span>Chapter number</span>
            <input
              autoFocus
              required
              value={form.number}
              onChange={(event) => onChange({ ...form, number: event.target.value })}
              placeholder="1"
            />
          </label>
          <label className="form-field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <div className="form-field full">
            <span>Page images</span>
            <div className="chapter-image-picker">
              <button className="button secondary" type="button" onClick={onChooseImages}>
                <ImageIcon size={16} />
                Choose images
              </button>
              <strong>{form.imagePaths.length} selected</strong>
            </div>
            {form.imagePaths.length > 0 ? (
              <div className="selected-file-list">
                {selectedPreview.map((imagePath) => (
                  <span key={imagePath}>{fileNameFromPath(imagePath)}</span>
                ))}
                {remainingCount > 0 ? <span>+{remainingCount} more</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        {imagePickerError ? <p className="error-line">{imagePickerError}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}

        <div className="form-actions end">
          <button className="button secondary" type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={!canSubmit}>
            {isSaving ? "Creating" : "Create chapter"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChapterRow({
  chapter,
  isPreparing,
  onOpen,
}: {
  chapter: Chapter;
  isPreparing: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className="chapter-row chapter-row-button"
      type="button"
      disabled={isPreparing}
      onClick={onOpen}
    >
      <strong>{chapter.displayLabel}</strong>
      <span>{chapter.title ?? "Untitled"}</span>
      <span className={`status-chip ${statusClass(chapter.status)}`}>{chapter.status}</span>
      <span
        className={`status-chip ${statusClass(isPreparing ? "Downloading" : chapter.downloadStatus)}`}
        title={chapter.downloadError ?? chapter.downloadStatus}
      >
        {isPreparing ? "Downloading" : chapter.downloadStatus}
      </span>
      <span className="internal-status">{chapter.internalStatus}</span>
      <span>{chapter.pagesCount} pages</span>
      <span>{chapter.textUnitsCount} text units</span>
      <div className="row-progress">
        <ProgressBar value={chapter.progress} />
        <small>{chapter.progress}%</small>
      </div>
    </button>
  );
}

function DictionaryTab({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const requestedSection = sectionParam === "glossary" || sectionParam === "characters" ? sectionParam : "characters";
  const [section, setSection] = useState<"characters" | "glossary">(requestedSection);
  const [searchValue, setSearchValue] = useState("");
  const [genderFilter, setGenderFilter] = useState<Gender | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [characterForm, setCharacterForm] = useState<CharacterFormState | null>(null);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termForm, setTermForm] = useState<TermFormState | null>(null);
  const queryClient = useQueryClient();
  const dictionaryQuery = useQuery({
    queryKey: ["project-dictionary", projectId],
    queryFn: () => getProjectDictionary(projectId),
  });

  useEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);

  const selectSection = (nextSection: "characters" | "glossary") => {
    setSection(nextSection);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", "dictionary");
      next.set("section", nextSection);
      return next;
    }, { replace: true });
  };

  const refreshDictionary = () => {
    queryClient.invalidateQueries({ queryKey: ["project-dictionary", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["library-stats"] });
  };

  const addCharacterMutation = useMutation({
    mutationFn: (input: CharacterInput) => addCharacter(projectId, input),
    onSuccess: () => {
      setCharacterForm(null);
      setEditingCharacterId(null);
      refreshDictionary();
    },
  });

  const updateCharacterMutation = useMutation({
    mutationFn: ({ characterId, input }: { characterId: string; input: CharacterInput }) =>
      updateCharacter(characterId, input),
    onSuccess: () => {
      setCharacterForm(null);
      setEditingCharacterId(null);
      refreshDictionary();
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => deleteCharacter(characterId),
    onSuccess: refreshDictionary,
  });

  const addTermMutation = useMutation({
    mutationFn: (input: GlossaryTermInput) => addGlossaryTerm(projectId, input),
    onSuccess: () => {
      setTermForm(null);
      setEditingTermId(null);
      refreshDictionary();
    },
  });

  const updateTermMutation = useMutation({
    mutationFn: ({ termId, input }: { termId: string; input: GlossaryTermInput }) =>
      updateGlossaryTerm(termId, input),
    onSuccess: () => {
      setTermForm(null);
      setEditingTermId(null);
      refreshDictionary();
    },
  });

  const deleteTermMutation = useMutation({
    mutationFn: (termId: string) => deleteGlossaryTerm(termId),
    onSuccess: refreshDictionary,
  });

  if (dictionaryQuery.isLoading) return <LoadingPanel label="Loading dictionary" />;
  const dictionary = dictionaryQuery.data;
  if (!dictionary) return <EmptyPanel label="Dictionary unavailable" />;

  const normalizedSearch = normalizeSearch(searchValue);
  const categoryOptions = dictionary.categories;

  const filteredCharacters = dictionary.characters.filter((character) => {
    const text = [
      character.englishName,
      character.arabicName,
      character.gender,
      character.description ?? "",
      ...character.aliases.flatMap((alias) => [alias.english, alias.arabic]),
    ].join(" ");
    const matchesSearch = !normalizedSearch || normalizeSearch(text).includes(normalizedSearch);
    const matchesGender = genderFilter === "All" || character.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const filteredTerms = dictionary.glossaryTerms.filter((term) => {
    const text = [
      term.englishTerm,
      term.arabicTerm,
      term.category,
      term.description ?? "",
    ].join(" ");
    const matchesSearch = !normalizedSearch || normalizeSearch(text).includes(normalizedSearch);
    const matchesCategory = categoryFilter === "All" || term.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const characterMutationError =
    addCharacterMutation.error ?? updateCharacterMutation.error ?? deleteCharacterMutation.error;
  const termMutationError = addTermMutation.error ?? updateTermMutation.error ?? deleteTermMutation.error;
  const isCharacterSaving = addCharacterMutation.isPending || updateCharacterMutation.isPending;
  const isTermSaving = addTermMutation.isPending || updateTermMutation.isPending;

  const openAddCharacter = () => {
    setEditingCharacterId(null);
    setCharacterForm(createEmptyCharacterForm());
    setEditingTermId(null);
    setTermForm(null);
  };

  const openEditCharacter = (character: Character) => {
    setEditingCharacterId(character.id);
    setCharacterForm(characterToForm(character));
    setEditingTermId(null);
    setTermForm(null);
  };

  const openAddTerm = () => {
    setEditingTermId(null);
    setTermForm(createEmptyTermForm());
    setEditingCharacterId(null);
    setCharacterForm(null);
  };

  const openEditTerm = (term: GlossaryTerm) => {
    setEditingTermId(term.id);
    setTermForm(termToForm(term));
    setEditingCharacterId(null);
    setCharacterForm(null);
  };

  const characterPayload = (): CharacterInput => {
    if (!characterForm) throw new Error("Character form is closed");
    return {
      englishName: characterForm.englishName.trim(),
      arabicName: characterForm.arabicName.trim(),
      gender: characterForm.gender,
      aliases: characterForm.aliases
        .map((alias) => ({
          id: alias.id,
          english: alias.english.trim(),
          arabic: alias.arabic.trim(),
        }))
        .filter((alias) => alias.english || alias.arabic),
      description: characterForm.description.trim() || undefined,
    };
  };

  const termPayload = (): GlossaryTermInput => {
    if (!termForm) throw new Error("Term form is closed");
    return {
      englishTerm: termForm.englishTerm.trim(),
      arabicTerm: termForm.arabicTerm.trim(),
      category: termForm.category.trim() || "General Term",
      description: termForm.description.trim() || undefined,
    };
  };

  const submitCharacter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = characterPayload();
    if (editingCharacterId) {
      updateCharacterMutation.mutate({ characterId: editingCharacterId, input });
    } else {
      addCharacterMutation.mutate(input);
    }
  };

  const submitTerm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = termPayload();
    if (editingTermId) {
      updateTermMutation.mutate({ termId: editingTermId, input });
    } else {
      addTermMutation.mutate(input);
    }
  };

  return (
    <div className="dictionary-view">
      <div className="subtabs">
        <button className={section === "characters" ? "active" : ""} onClick={() => selectSection("characters")}>
          Characters
        </button>
        <button className={section === "glossary" ? "active" : ""} onClick={() => selectSection("glossary")}>
          General Glossary
        </button>
      </div>

      <div className="dictionary-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={section === "characters" ? "Search characters" : "Search terms"}
          />
        </div>
        {section === "characters" ? (
          <select
            className="field-select"
            value={genderFilter}
            onChange={(event) => setGenderFilter(event.target.value as Gender | "All")}
          >
            <option value="All">All genders</option>
            {genderOptions.map((gender) => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </select>
        ) : (
          <select
            className="field-select"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="All">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        )}
      </div>

      {section === "characters" ? (
        <div className="table-card">
          <div className="table-title">
            <h2>Characters</h2>
            <button className="button secondary" onClick={openAddCharacter}>
              <Plus size={16} />
              Add character
            </button>
          </div>
          {characterForm ? (
            <form className="dictionary-editor" onSubmit={submitCharacter}>
              <div className="editor-grid">
                <label className="form-field">
                  <span>English Name</span>
                  <input
                    required
                    value={characterForm.englishName}
                    onChange={(event) =>
                      setCharacterForm({ ...characterForm, englishName: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Arabic Name</span>
                  <input
                    required
                    dir="rtl"
                    value={characterForm.arabicName}
                    onChange={(event) =>
                      setCharacterForm({ ...characterForm, arabicName: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Gender</span>
                  <select
                    value={characterForm.gender}
                    onChange={(event) =>
                      setCharacterForm({ ...characterForm, gender: event.target.value as Gender })
                    }
                  >
                    {genderOptions.map((gender) => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field full">
                  <span>Description</span>
                  <textarea
                    value={characterForm.description}
                    onChange={(event) =>
                      setCharacterForm({ ...characterForm, description: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="alias-editor">
                <div className="inline-heading">
                  <strong>Aliases</strong>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setCharacterForm({
                        ...characterForm,
                        aliases: [...characterForm.aliases, { english: "", arabic: "" }],
                      })
                    }
                  >
                    <Plus size={15} />
                    Add alias
                  </button>
                </div>
                {characterForm.aliases.length === 0 ? (
                  <p className="muted">No aliases.</p>
                ) : null}
                {characterForm.aliases.map((alias, index) => (
                  <div className="alias-row" key={alias.id ?? index}>
                    <input
                      required
                      value={alias.english}
                      placeholder="English Alias"
                      onChange={(event) => {
                        const aliases = [...characterForm.aliases];
                        aliases[index] = { ...alias, english: event.target.value };
                        setCharacterForm({ ...characterForm, aliases });
                      }}
                    />
                    <input
                      required
                      dir="rtl"
                      value={alias.arabic}
                      placeholder="Arabic Alias"
                      onChange={(event) => {
                        const aliases = [...characterForm.aliases];
                        aliases[index] = { ...alias, arabic: event.target.value };
                        setCharacterForm({ ...characterForm, aliases });
                      }}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove alias"
                      onClick={() =>
                        setCharacterForm({
                          ...characterForm,
                          aliases: characterForm.aliases.filter((_, aliasIndex) => aliasIndex !== index),
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {characterMutationError ? (
                <p className="error-line">{(characterMutationError as Error).message}</p>
              ) : null}
              <div className="form-actions">
                <button className="button primary" disabled={isCharacterSaving} type="submit">
                  <Save size={16} />
                  {editingCharacterId ? "Save character" : "Create character"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setCharacterForm(null);
                    setEditingCharacterId(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          <div className="dictionary-table characters-table">
            <div className="dictionary-head">
              <span>English Name</span>
              <span>Arabic Name</span>
              <span>Gender</span>
              <span>Aliases</span>
              <span>Description</span>
              <span>Actions</span>
            </div>
            {filteredCharacters.map((character) => (
              <div className="dictionary-row" key={character.id}>
                <strong>{character.englishName}</strong>
                <span dir="rtl">{character.arabicName}</span>
                <span>{character.gender}</span>
                <span>
                  {character.aliases.map((alias) => `${alias.english} / ${alias.arabic}`).join(", ") || "None"}
                </span>
                <span>{character.description ?? "No description"}</span>
                <div className="row-actions">
                  <button className="icon-button" title="Edit character" onClick={() => openEditCharacter(character)}>
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="Delete character"
                    onClick={() => {
                      if (window.confirm(`Delete ${character.englishName}?`)) {
                        deleteCharacterMutation.mutate(character.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {filteredCharacters.length === 0 ? <EmptyPanel label="No matching characters" /> : null}
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-title">
            <h2>General Glossary</h2>
            <button className="button secondary" onClick={openAddTerm}>
              <Plus size={16} />
              Add term
            </button>
          </div>
          {termForm ? (
            <form className="dictionary-editor" onSubmit={submitTerm}>
              <div className="editor-grid">
                <label className="form-field">
                  <span>English Term</span>
                  <input
                    required
                    value={termForm.englishTerm}
                    onChange={(event) =>
                      setTermForm({ ...termForm, englishTerm: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Arabic Term</span>
                  <input
                    required
                    dir="rtl"
                    value={termForm.arabicTerm}
                    onChange={(event) =>
                      setTermForm({ ...termForm, arabicTerm: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Category</span>
                  <input
                    required
                    list="glossary-category-options"
                    value={termForm.category}
                    onChange={(event) => setTermForm({ ...termForm, category: event.target.value })}
                  />
                </label>
                <label className="form-field full">
                  <span>Description</span>
                  <textarea
                    value={termForm.description}
                    onChange={(event) =>
                      setTermForm({ ...termForm, description: event.target.value })
                    }
                  />
                </label>
              </div>
              <datalist id="glossary-category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              {termMutationError ? (
                <p className="error-line">{(termMutationError as Error).message}</p>
              ) : null}
              <div className="form-actions">
                <button className="button primary" disabled={isTermSaving} type="submit">
                  <Save size={16} />
                  {editingTermId ? "Save term" : "Create term"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setTermForm(null);
                    setEditingTermId(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          <div className="category-row">
            {categoryOptions.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
          <div className="dictionary-table terms-table">
            <div className="dictionary-head">
              <span>English Term</span>
              <span>Arabic Term</span>
              <span>Category</span>
              <span>Description</span>
              <span>Actions</span>
            </div>
            {filteredTerms.map((term) => (
              <div className="dictionary-row" key={term.id}>
                <strong>{term.englishTerm}</strong>
                <span dir="rtl">{term.arabicTerm}</span>
                <span>{term.category}</span>
                <span>{term.description ?? "No description"}</span>
                <div className="row-actions">
                  <button className="icon-button" title="Edit term" onClick={() => openEditTerm(term)}>
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="Delete term"
                    onClick={() => {
                      if (window.confirm(`Delete ${term.englishTerm}?`)) {
                        deleteTermMutation.mutate(term.id);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {filteredTerms.length === 0 ? <EmptyPanel label="No matching terms" /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function TranslationPage() {
  const { projectId, chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editPageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const splitStageRef = useRef<HTMLDivElement | null>(null);
  const textBoxDragRef = useRef<TextBoxDragState | null>(null);
  const translationScreenRef = useRef<HTMLElement | null>(null);
  const ocrSelectionRef = useRef<OcrSelectionState | null>(null);
  const [viewerMode, setViewerMode] = useState<"page" | "webtoon">("page");
  const [mergePages, setMergePages] = useState(false);
  const [originalPanePercent, setOriginalPanePercent] = useState(44);
  const [ocrProviderId, setOcrProviderId] = useState<OcrProviderId>("windows");
  const [ocrLanguageHint, setOcrLanguageHint] = useState("english");
  const [replaceOcrText, setReplaceOcrText] = useState(true);
  const [ocrSelection, setOcrSelection] = useState<OcrSelectionState | null>(null);
  const [textBoxDraft, setTextBoxDraft] = useState<TextBoxDraftState | null>(null);
  const {
    selectedPageId,
    selectedTextUnitId,
    activeTool,
    zoom,
    setSelectedPageId,
    setSelectedTextUnitId,
    setActiveTool,
    setZoom,
  } = useTranslationWorkspaceStore();

  const workspaceQuery = useQuery({
    queryKey: ["translation-workspace", chapterId],
    queryFn: () => getChapterForTranslation(chapterId ?? ""),
  });
  const ocrProvidersQuery = useQuery({
    queryKey: ["ocr-providers", ocrLanguageHint],
    queryFn: () => listOcrProviders(ocrLanguageHint),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateFinalTranslation(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", chapterId] });
    },
  });
  const sourceMutation = useMutation({
    mutationFn: ({
      id,
      sourceStatus,
      sourceText,
    }: {
      id: string;
      sourceStatus: OcrSourceStatus;
      sourceText: string;
    }) => updateTextUnitSource(id, { sourceStatus, sourceText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", chapterId] });
    },
  });
  const deleteTextUnitMutation = useMutation({
    mutationFn: (textUnitId: string) => deleteTextUnit(textUnitId),
    onSuccess: (_result, deletedTextUnitId) => {
      const units = workspace?.textUnits ?? [];
      const deletedIndex = units.findIndex((unit) => unit.id === deletedTextUnitId);
      const nextUnit = units[deletedIndex + 1] ?? units[deletedIndex - 1];
      setSelectedTextUnitId(nextUnit?.id ?? "");
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const updateTextUnitTypesettingMutation = useMutation({
    mutationFn: ({ input, textUnitId }: { input: TextUnitTypesettingInput; textUnitId: string }) =>
      updateTextUnitTypesetting(textUnitId, input),
    onSuccess: (result) => {
      queryClient.setQueryData<ChapterTranslationWorkspace | undefined>(
        ["translation-workspace", result.chapterId],
        (current) => current
          ? {
            ...current,
            textUnits: current.textUnits.map((unit) => unit.id === result.id
              ? {
                ...unit,
                typesetting: {
                  ...unit.typesetting,
                  box: result.box,
                  fontSize: result.fontSize,
                },
              }
              : unit),
          }
          : current,
      );
      setTextBoxDraft((draft) => (draft?.textUnitId === result.id ? null : draft));
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: () => {
      setTextBoxDraft(null);
    },
  });
  const updateChapterTextSizeMutation = useMutation({
    mutationFn: (delta: number) => updateChapterTextSize(chapterId ?? "", { delta }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const runPageOcrMutation = useMutation({
    mutationFn: ({ pageId, input }: { pageId: string; input: OcrRunOptions }) =>
      runOcrForPage(pageId, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const runRegionOcrMutation = useMutation({
    mutationFn: ({ input, pageId }: { input: OcrRegionRunOptions; pageId: string }) =>
      runOcrForRegion(pageId, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const runChapterOcrMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OcrRunOptions }) =>
      runOcrForChapter(id, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });

  const workspace = workspaceQuery.data;
  const textUnitsByPage = useMemo(() => {
    const groups = new Map<string, TextUnit[]>();
    for (const unit of workspace?.textUnits ?? []) {
      const group = groups.get(unit.pageId) ?? [];
      group.push(unit);
      groups.set(unit.pageId, group);
    }
    return groups;
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const firstPageId = workspace.pages[0]?.id;
    const firstTextUnitId = workspace.textUnits[0]?.id;
    const hasSelectedPage = workspace.pages.some((page) => page.id === selectedPageId);
    const hasSelectedTextUnit = workspace.textUnits.some((unit) => unit.id === selectedTextUnitId);
    if (!hasSelectedPage && firstPageId) setSelectedPageId(firstPageId);
    if (!hasSelectedTextUnit && firstTextUnitId) setSelectedTextUnitId(firstTextUnitId);
  }, [workspace, selectedPageId, selectedTextUnitId, setSelectedPageId, setSelectedTextUnitId]);

  useEffect(() => {
    if (viewerMode !== "webtoon" || !selectedPageId) return;
    window.requestAnimationFrame(() => {
      pageRefs.current[selectedPageId]?.scrollIntoView({ block: "start" });
      editPageRefs.current[selectedPageId]?.scrollIntoView({ block: "start" });
    });
  }, [selectedPageId, viewerMode]);

  useEffect(() => {
    const providers = ocrProvidersQuery.data;
    if (!providers || providers.length === 0) return;
    const selected = providers.find((provider) => provider.id === ocrProviderId);
    if (selected?.available) return;
    const available = providers.find((provider) => provider.available);
    if (available) setOcrProviderId(available.id);
  }, [ocrProviderId, ocrProvidersQuery.data]);

  useEffect(() => {
    if (ocrSelection && !workspace?.pages.some((page) => page.id === ocrSelection.pageId)) {
      ocrSelectionRef.current = null;
      setOcrSelection(null);
    }
  }, [ocrSelection, workspace?.pages]);

  if (workspaceQuery.isLoading) return <LoadingPanel label="Loading translation workspace" />;
  if (!workspace) return <EmptyPanel label="Chapter not found" />;
  if (workspace.pages.length === 0) return <EmptyPanel label="Chapter pages are not prepared yet" />;

  const currentPage = workspace.pages.find((page) => page.id === selectedPageId) ?? workspace.pages[0];
  const pageTextUnits = textUnitsByPage.get(currentPage.id) ?? [];
  const selectedTextUnit =
    workspace.textUnits.find((unit) => unit.id === selectedTextUnitId) ?? workspace.textUnits[0];
  const selectedFontSize = clampTextUnitFontSize(selectedTextUnit?.typesetting.fontSize ?? 18);

  const selectedDictionaryText = dictionaryTextForUnit(selectedTextUnit);
  const matchedCharacterIdSet = new Set(selectedTextUnit?.matchedCharacterIds ?? []);
  const matchedTermIdSet = new Set(selectedTextUnit?.matchedGlossaryTermIds ?? []);
  const matchedCharacters = workspace.characters.filter((character) =>
    matchedCharacterIdSet.has(character.id) || characterMatchesText(character, selectedDictionaryText),
  );
  const matchedTerms = workspace.glossaryTerms.filter((term) =>
    matchedTermIdSet.has(term.id) || glossaryTermMatchesText(term, selectedDictionaryText),
  );
  const selectPage = (pageId: string) => {
    setSelectedPageId(pageId);
    if (viewerMode === "webtoon") {
      window.requestAnimationFrame(() => {
        pageRefs.current[pageId]?.scrollIntoView({ block: "start" });
        editPageRefs.current[pageId]?.scrollIntoView({ block: "start" });
      });
    }
  };
  const selectTextUnit = (unit: TextUnit) => {
    setSelectedTextUnitId(unit.id);
    selectPage(unit.pageId);
  };
  const setSelectedTextFontSize = (fontSize: number) => {
    if (!selectedTextUnit || updateTextUnitTypesettingMutation.isPending) return;
    updateTextUnitTypesettingMutation.mutate({
      input: { fontSize: clampTextUnitFontSize(fontSize) },
      textUnitId: selectedTextUnit.id,
    });
  };
  const adjustSelectedTextFontSize = (delta: number) => {
    setSelectedTextFontSize(selectedFontSize + delta);
  };
  const adjustAllTextFontSizes = (delta: number) => {
    if (!chapterId || updateChapterTextSizeMutation.isPending || workspace.textUnits.length === 0) return;
    updateChapterTextSizeMutation.mutate(delta);
  };
  const pageForTextUnit = (unit: TextUnit) =>
    workspace.pages.find((page) => page.id === unit.pageId) ?? currentPage;
  const textBoxForUnit = (unit: TextUnit) =>
    textBoxDraft?.textUnitId === unit.id ? textBoxDraft.box : unit.typesetting.box ?? unit.region;
  const selectedTextBox = selectedTextUnit ? textBoxForUnit(selectedTextUnit) : undefined;
  const setSelectedTextBox = (box: RegionBox) => {
    if (!selectedTextUnit || updateTextUnitTypesettingMutation.isPending) return;
    const page = pageForTextUnit(selectedTextUnit);
    updateTextUnitTypesettingMutation.mutate({
      input: { box: clampTextBoxToPage(box, page) },
      textUnitId: selectedTextUnit.id,
    });
  };
  const updateSelectedTextBoxField = (field: "x" | "y" | "width" | "height", value: number) => {
    if (!selectedTextUnit || !selectedTextBox || !Number.isFinite(value)) return;
    setSelectedTextBox({
      ...selectedTextBox,
      [field]: value,
    });
  };
  const resetSelectedTextBoxToOcrRegion = () => {
    if (!selectedTextUnit) return;
    setSelectedTextBox(selectedTextUnit.region);
  };
  const commitTextBoxTransform = (textUnitId: string, box: RegionBox) => {
    updateTextUnitTypesettingMutation.mutate({
      input: { box },
      textUnitId,
    });
  };
  const beginTextBoxTransform = (
    event: PointerEvent<HTMLElement>,
    unit: TextUnit,
    page: Page,
    mode: TextBoxDragMode,
  ) => {
    if (event.button !== 0 || updateTextUnitTypesettingMutation.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    selectTextUnit(unit);
    setActiveTool("typeset");

    const startBox = clampTextBoxToPage(textBoxForUnit(unit), page);
    const dragState: TextBoxDragState = {
      currentBox: startBox,
      mode,
      page,
      startBox,
      startClientX: event.clientX,
      startClientY: event.clientY,
      textUnitId: unit.id,
      zoom,
    };
    textBoxDragRef.current = dragState;
    setTextBoxDraft({ box: startBox, textUnitId: unit.id });

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const currentDragState = textBoxDragRef.current;
      if (!currentDragState) return;
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - currentDragState.startClientX) / currentDragState.zoom;
      const deltaY = (moveEvent.clientY - currentDragState.startClientY) / currentDragState.zoom;
      const box = transformTextBox(
        currentDragState.mode,
        currentDragState.startBox,
        deltaX,
        deltaY,
        currentDragState.page,
      );
      currentDragState.currentBox = box;
      setTextBoxDraft({ box, textUnitId: currentDragState.textUnitId });
    };

    const handleUp = () => {
      const currentDragState = textBoxDragRef.current;
      textBoxDragRef.current = null;
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      if (!currentDragState) return;
      commitTextBoxTransform(currentDragState.textUnitId, currentDragState.currentBox);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp, { once: true });
  };
  const ocrInput: OcrRunOptions = {
    languageHint: ocrLanguageHint || undefined,
    providerId: ocrProviderId,
    replaceExisting: replaceOcrText,
  };
  const selectedOcrRegion = normalizeSelectionRegion(ocrSelection);
  const selectedProvider = ocrProvidersQuery.data?.find((provider) => provider.id === ocrProviderId);
  const isOcrRunning =
    runPageOcrMutation.isPending || runRegionOcrMutation.isPending || runChapterOcrMutation.isPending;
  const ocrError =
    runPageOcrMutation.error instanceof Error
      ? runPageOcrMutation.error.message
      : runRegionOcrMutation.error instanceof Error
        ? runRegionOcrMutation.error.message
        : runChapterOcrMutation.error instanceof Error
          ? runChapterOcrMutation.error.message
          : null;
  const runCurrentPageOcr = () => {
    if (!currentPage || isOcrRunning) return;
    runPageOcrMutation.mutate({ input: ocrInput, pageId: currentPage.id });
  };
  const runOcrSelection = (selection: OcrSelectionState) => {
    const region = normalizeSelectionRegion(selection);
    if (!region || isOcrRunning || !selectedProvider?.available) return;
    runRegionOcrMutation.mutate({
      input: {
        ...ocrInput,
        expansion: DEFAULT_OCR_REGION_EXPANSION,
        region,
        replaceExisting: false,
      },
      pageId: selection.pageId,
    });
  };
  const runWholeChapterOcr = () => {
    if (!chapterId || isOcrRunning) return;
    runChapterOcrMutation.mutate({ id: chapterId, input: ocrInput });
  };
  const startOcrTextSelection = () => {
    ocrSelectionRef.current = null;
    setOcrSelection(null);
    setActiveTool("ocr");
    window.requestAnimationFrame(() => {
      translationScreenRef.current?.focus({ preventScroll: true });
    });
  };
  const pointFromSvg = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * page.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * page.height;
    return {
      x: Math.max(0, Math.min(page.width, x)),
      y: Math.max(0, Math.min(page.height, y)),
    };
  };
  const beginOcrSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool !== "ocr" || isOcrRunning || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    const point = pointFromSvg(event, page);
    event.currentTarget.setPointerCapture(event.pointerId);
    const selection = {
      pageId: page.id,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    ocrSelectionRef.current = selection;
    setSelectedPageId(page.id);
    setOcrSelection(selection);
  };
  const moveOcrSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    const currentSelection = ocrSelectionRef.current;
    if (activeTool !== "ocr" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    const point = pointFromSvg(event, page);
    const nextSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    ocrSelectionRef.current = nextSelection;
    setOcrSelection(nextSelection);
  };
  const endOcrSelection = (event: PointerEvent<SVGSVGElement>, page: Page, shouldRun = true) => {
    const currentSelection = ocrSelectionRef.current;
    if (activeTool !== "ocr" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const point = pointFromSvg(event, page);
    const finalSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    if (!normalizeSelectionRegion(finalSelection)) {
      ocrSelectionRef.current = null;
      setOcrSelection(null);
      return;
    }
    ocrSelectionRef.current = finalSelection;
    setOcrSelection(finalSelection);
    if (shouldRun) runOcrSelection(finalSelection);
  };
  const updatePageSplit = (clientX: number) => {
    const bounds = splitStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const nextPercent = ((clientX - bounds.left) / bounds.width) * 100;
    setOriginalPanePercent(Math.max(28, Math.min(62, nextPercent)));
  };
  const beginPageSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    updatePageSplit(event.clientX);

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      updatePageSplit(moveEvent.clientX);
    };
    const handleUp = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp, { once: true });
  };
  const confirmOcrSelectionOnEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || activeTool !== "ocr") return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    event.preventDefault();
    const selection = ocrSelectionRef.current ?? ocrSelection;
    if (selection) runOcrSelection(selection);
  };
  const pageSurfaceStyle = (page: Page) => ({
    height: page.height * zoom,
    width: page.width * zoom,
  });
  const editWhiteoutRegionStyle = (unit: TextUnit) => ({
    height: Math.max(8, unit.region.height * zoom),
    left: unit.region.x * zoom,
    top: unit.region.y * zoom,
    width: Math.max(8, unit.region.width * zoom),
  });
  const editRegionStyle = (unit: TextUnit) => {
    const box = textBoxForUnit(unit);
    return {
      fontSize: clampTextUnitFontSize(unit.typesetting.fontSize) * zoom,
      height: Math.max(MIN_TEXT_BOX_HEIGHT, box.height * zoom),
      left: box.x * zoom,
      top: box.y * zoom,
      width: Math.max(MIN_TEXT_BOX_WIDTH, box.width * zoom),
    };
  };
  const renderPageArtwork = (page: Page) =>
    isRenderableImageUrl(page.imageUrl) ? (
      <img className="page-image" src={page.imageUrl ?? ""} alt={`Page ${page.index}`} />
    ) : (
      <>
        <div className="mock-panel panel-a" />
        <div className="mock-panel panel-b" />
        <div className="mock-panel panel-c" />
      </>
    );
  const renderOriginalPageSurface = (page: Page, units: TextUnit[], surfaceClassName = "") => (
    <div
      className={`mock-page original-page-surface page-tone-${page.imageTone} ${surfaceClassName}`.trim()}
      style={pageSurfaceStyle(page)}
    >
      {renderPageArtwork(page)}
      <svg
        className={activeTool === "ocr" ? "region-layer is-selecting" : "region-layer"}
        tabIndex={0}
        viewBox={`0 0 ${page.width} ${page.height}`}
        onPointerDown={(event) => beginOcrSelection(event, page)}
        onPointerMove={(event) => moveOcrSelection(event, page)}
        onPointerUp={(event) => endOcrSelection(event, page)}
        onPointerCancel={(event) => endOcrSelection(event, page, false)}
      >
        {units.map((unit) => (
          <rect
            key={unit.id}
            x={unit.region.x}
            y={unit.region.y}
            width={unit.region.width}
            height={unit.region.height}
            rx={12}
            className={unit.id === selectedTextUnit?.id ? "region selected" : "region"}
            onClick={() => {
              if (activeTool !== "ocr") selectTextUnit(unit);
            }}
          />
        ))}
        {ocrSelection?.pageId === page.id && selectedOcrRegion ? (
          <rect
            className="ocr-selection-region"
            x={selectedOcrRegion.x}
            y={selectedOcrRegion.y}
            width={selectedOcrRegion.width}
            height={selectedOcrRegion.height}
            rx={10}
          />
        ) : null}
      </svg>
    </div>
  );
  const renderEditPageSurface = (page: Page, units: TextUnit[], surfaceClassName = "") => (
    <div
      className={`mock-page edit-page-surface page-tone-${page.imageTone} ${surfaceClassName}`.trim()}
      style={pageSurfaceStyle(page)}
    >
      {renderPageArtwork(page)}
      <div className="edit-work-layer">
        {units.map((unit) => {
          const label = unit.finalTranslation || unit.microsoftTranslation || unit.aiTranslation || unit.sourceText;
          const isSelected = unit.id === selectedTextUnit?.id;
          return (
            <div className="edit-text-item" key={unit.id}>
              <div className="edit-whiteout-region" style={editWhiteoutRegionStyle(unit)} />
              <button
                className={isSelected ? "edit-text-region selected" : "edit-text-region"}
                onClick={() => selectTextUnit(unit)}
                onPointerDown={(event) => beginTextBoxTransform(event, unit, page, "move")}
                style={editRegionStyle(unit)}
                title={unit.sourceText}
                type="button"
              >
                <span className="edit-text-content" dir="auto">{label}</span>
                {isSelected ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="text-box-resize-handle handle-nw"
                      onPointerDown={(event) => beginTextBoxTransform(event, unit, page, "resize-nw")}
                    />
                    <span
                      aria-hidden="true"
                      className="text-box-resize-handle handle-ne"
                      onPointerDown={(event) => beginTextBoxTransform(event, unit, page, "resize-ne")}
                    />
                    <span
                      aria-hidden="true"
                      className="text-box-resize-handle handle-sw"
                      onPointerDown={(event) => beginTextBoxTransform(event, unit, page, "resize-sw")}
                    />
                    <span
                      aria-hidden="true"
                      className="text-box-resize-handle handle-se"
                      onPointerDown={(event) => beginTextBoxTransform(event, unit, page, "resize-se")}
                    />
                  </>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <section
      className="translation-screen"
      onKeyUp={confirmOcrSelectionOnEnter}
      ref={translationScreenRef}
      tabIndex={-1}
    >
      <header className="translation-topbar">
        <button className="icon-button" onClick={() => navigate(`/projects/${projectId}`)} title="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <strong>{workspace.project.title}</strong>
          <span>{workspace.chapter.displayLabel} / {workspace.chapter.internalStatus}</span>
        </div>
        <div className="topbar-actions">
          <select
            className="field-select compact-select"
            value={ocrProviderId}
            onChange={(event) => setOcrProviderId(event.target.value as OcrProviderId)}
            title={selectedProvider?.reason ?? selectedProvider?.label ?? "OCR provider"}
          >
            {(ocrProvidersQuery.data ?? []).map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.available ? provider.label : `${provider.label} (not ready)`}
              </option>
            ))}
          </select>
          <select
            className="field-select compact-select"
            value={ocrLanguageHint}
            onChange={(event) => setOcrLanguageHint(event.target.value)}
            title="OCR language hint"
          >
            {ocrLanguageOptions.map(([value, label]) => (
              <option key={value || "auto"} value={value}>{label}</option>
            ))}
          </select>
          <label className="compact-check" title="Replace existing OCR text units on selected pages">
            <input
              type="checkbox"
              checked={replaceOcrText}
              onChange={(event) => setReplaceOcrText(event.target.checked)}
            />
            Replace
          </label>
          <button
            className="button secondary"
            disabled={isOcrRunning || !selectedProvider?.available}
            onClick={runCurrentPageOcr}
          >
            <Wand2 size={15} />
            Page OCR
          </button>
          <button
            className={activeTool === "ocr" ? "button secondary active-command" : "button secondary"}
            disabled={isOcrRunning}
            onClick={startOcrTextSelection}
            title="Enable OCR rectangle selection"
          >
            <Highlighter size={15} />
            Select text
          </button>
          <button
            className="button secondary"
            disabled={isOcrRunning || !selectedProvider?.available}
            onClick={runWholeChapterOcr}
          >
            <Layers3 size={15} />
            Chapter OCR
          </button>
          <button className="button secondary"><Sparkles size={15} />AI Translate</button>
          <button className="button secondary"><Languages size={15} />Microsoft</button>
          <button className="button secondary"><ShieldCheck size={15} />Quality</button>
          <button className="button primary"><Download size={15} />Export</button>
        </div>
      </header>

      <div className="translation-layout">
        <aside className="translation-left">
          <MiniDictionary
            characters={matchedCharacters}
            projectId={workspace.project.id}
            terms={matchedTerms}
            selectedTextUnit={selectedTextUnit}
          />
          {selectedProvider && !selectedProvider.available ? (
            <p className="ocr-status-line">{selectedProvider.reason ?? selectedProvider.setup}</p>
          ) : null}
          {ocrError ? <p className="error-line ocr-status-line">{ocrError}</p> : null}
          {isOcrRunning ? <p className="ocr-status-line">Running OCR...</p> : null}
          <div className="text-unit-list">
            {workspace.textUnits.length === 0 ? (
              <EmptyPanel label="Run OCR to create text units" />
            ) : null}
            {workspace.textUnits.map((unit) => (
              <TextUnitCard
                key={unit.id}
                unit={unit}
                selected={unit.id === selectedTextUnit?.id}
                onSelect={() => selectTextUnit(unit)}
                onFinalChange={(text) => mutation.mutate({ id: unit.id, text })}
                onSourceChange={(sourceText, sourceStatus) =>
                  sourceMutation.mutate({ id: unit.id, sourceStatus, sourceText })
                }
                onDelete={() => deleteTextUnitMutation.mutate(unit.id)}
                isDeleting={deleteTextUnitMutation.isPending && deleteTextUnitMutation.variables === unit.id}
              />
            ))}
          </div>
        </aside>

        <main className="page-viewer-panel">
          <div className="page-viewer-toolbar">
            <div className="page-switcher">
              <button className="icon-button" onClick={() => setZoom(zoom - 0.08)} title="Zoom out">
                <ZoomOut size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="icon-button" onClick={() => setZoom(zoom + 0.08)} title="Zoom in">
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="viewer-mode-controls">
              <button
                className={viewerMode === "page" ? "active" : ""}
                onClick={() => setViewerMode("page")}
              >
                Page
              </button>
              <button
                className={viewerMode === "webtoon" ? "active" : ""}
                onClick={() => setViewerMode("webtoon")}
              >
                Webtoon
              </button>
              <label className={viewerMode === "webtoon" ? "merge-toggle" : "merge-toggle disabled"}>
                <input
                  type="checkbox"
                  checked={mergePages}
                  disabled={viewerMode !== "webtoon"}
                  onChange={(event) => setMergePages(event.target.checked)}
                />
                Merge pages
              </label>
            </div>
            <div className="page-switcher">
              {workspace.pages.map((page) => (
                <button
                  key={page.id}
                  className={page.id === currentPage.id ? "active" : ""}
                  onClick={() => selectPage(page.id)}
                >
                  {page.index}
                </button>
              ))}
            </div>
          </div>

          <div
            className="page-stage translation-split-stage"
            ref={splitStageRef}
            style={{ gridTemplateColumns: `${originalPanePercent}% 10px minmax(0, 1fr)` }}
          >
            <section className="translation-page-pane translation-page-pane--original">
              <div className="translation-pane-header">
                <strong>Original</strong>
                <span>OCR source</span>
              </div>
              <div className={viewerMode === "webtoon" ? "pane-page-scroll webtoon-stage" : "pane-page-scroll"}>
                {viewerMode === "page" ? (
                  renderOriginalPageSurface(currentPage, pageTextUnits)
                ) : (
                  <div className={mergePages ? "webtoon-page-stack merged" : "webtoon-page-stack"}>
                    {workspace.pages.map((page) => {
                      const units = textUnitsByPage.get(page.id) ?? [];
                      return (
                        <div
                          className={page.id === currentPage.id ? "webtoon-page-anchor active" : "webtoon-page-anchor"}
                          data-page-index={page.index}
                          key={page.id}
                          ref={(element) => {
                            pageRefs.current[page.id] = element;
                          }}
                        >
                          {renderOriginalPageSurface(page, units, "webtoon-page-surface")}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div
              aria-label="Resize original and edit panes"
              className="pane-resizer"
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setOriginalPanePercent((value) => Math.max(28, value - 3));
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setOriginalPanePercent((value) => Math.min(62, value + 3));
                }
              }}
              onPointerDown={beginPageSplitResize}
              role="separator"
              tabIndex={0}
            />

            <section className="translation-page-pane translation-page-pane--edit">
              <div className="translation-pane-header">
                <strong>Edit</strong>
                <span>Working copy</span>
              </div>
              <div className={viewerMode === "webtoon" ? "pane-page-scroll webtoon-stage" : "pane-page-scroll"}>
                {viewerMode === "page" ? (
                  renderEditPageSurface(currentPage, pageTextUnits)
                ) : (
                  <div className={mergePages ? "webtoon-page-stack merged" : "webtoon-page-stack"}>
                    {workspace.pages.map((page) => {
                      const units = textUnitsByPage.get(page.id) ?? [];
                      return (
                        <div
                          className={page.id === currentPage.id ? "webtoon-page-anchor active" : "webtoon-page-anchor"}
                          data-page-index={page.index}
                          key={page.id}
                          ref={(element) => {
                            editPageRefs.current[page.id] = element;
                          }}
                        >
                          {renderEditPageSurface(page, units, "webtoon-page-surface")}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>

        <aside className="translation-tools">
          <ToolGroup
            title="Navigation"
            tools={[
              ["pan", MousePointer2],
              ["select", Highlighter],
            ]}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />
          <ToolGroup
            title="OCR"
            tools={[
              ["ocr", Eye],
              ["review", ClipboardCheck],
            ]}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />
          <ToolGroup
            title="Translation"
            tools={[
              ["translate", Bot],
              ["typeset", Type],
              ["export", Download],
            ]}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />
          <div className="tool-panel">
            <h3>Selected Text</h3>
            <p>{selectedTextUnit?.sourceText}</p>
            <small>{selectedTextUnit?.reviewStatus}</small>
          </div>
          <div className="tool-panel text-size-panel">
            <h3>Text Size</h3>
            <div className="text-size-control">
              <span>All text</span>
              <div className="text-size-buttons">
                <button
                  className="icon-button"
                  disabled={updateChapterTextSizeMutation.isPending || workspace.textUnits.length === 0}
                  onClick={() => adjustAllTextFontSizes(-TEXT_UNIT_FONT_STEP)}
                  title="Decrease all text"
                  type="button"
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={updateChapterTextSizeMutation.isPending || workspace.textUnits.length === 0}
                  onClick={() => adjustAllTextFontSizes(TEXT_UNIT_FONT_STEP)}
                  title="Increase all text"
                  type="button"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            </div>
            <div className="text-size-control">
              <span>Selected</span>
              <div className="font-size-row">
                <button
                  className="icon-button"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  onClick={() => adjustSelectedTextFontSize(-TEXT_UNIT_FONT_STEP)}
                  title="Decrease selected text"
                  type="button"
                >
                  <ZoomOut size={15} />
                </button>
                <input
                  className="font-size-input"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  max={MAX_TEXT_UNIT_FONT_SIZE}
                  min={MIN_TEXT_UNIT_FONT_SIZE}
                  onChange={(event) => setSelectedTextFontSize(Number(event.target.value))}
                  step={TEXT_UNIT_FONT_STEP}
                  type="number"
                  value={selectedTextUnit ? selectedFontSize : ""}
                />
                <button
                  className="icon-button"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  onClick={() => adjustSelectedTextFontSize(TEXT_UNIT_FONT_STEP)}
                  title="Increase selected text"
                  type="button"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
              <input
                className="font-size-range"
                disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                max={MAX_TEXT_UNIT_FONT_SIZE}
                min={MIN_TEXT_UNIT_FONT_SIZE}
                onChange={(event) => setSelectedTextFontSize(Number(event.target.value))}
                step={TEXT_UNIT_FONT_STEP}
                type="range"
                value={selectedTextUnit ? selectedFontSize : MIN_TEXT_UNIT_FONT_SIZE}
              />
            </div>
          </div>
          <div className="tool-panel text-box-panel">
            <h3>Text Box</h3>
            <div className="text-box-grid">
              <label>
                <span>X</span>
                <input
                  className="box-number-input"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  min={0}
                  onChange={(event) => updateSelectedTextBoxField("x", Number(event.target.value))}
                  type="number"
                  value={selectedTextBox ? Math.round(selectedTextBox.x) : ""}
                />
              </label>
              <label>
                <span>Y</span>
                <input
                  className="box-number-input"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  min={0}
                  onChange={(event) => updateSelectedTextBoxField("y", Number(event.target.value))}
                  type="number"
                  value={selectedTextBox ? Math.round(selectedTextBox.y) : ""}
                />
              </label>
              <label>
                <span>W</span>
                <input
                  className="box-number-input"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  min={MIN_TEXT_BOX_WIDTH}
                  onChange={(event) => updateSelectedTextBoxField("width", Number(event.target.value))}
                  type="number"
                  value={selectedTextBox ? Math.round(selectedTextBox.width) : ""}
                />
              </label>
              <label>
                <span>H</span>
                <input
                  className="box-number-input"
                  disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
                  min={MIN_TEXT_BOX_HEIGHT}
                  onChange={(event) => updateSelectedTextBoxField("height", Number(event.target.value))}
                  type="number"
                  value={selectedTextBox ? Math.round(selectedTextBox.height) : ""}
                />
              </label>
            </div>
            <button
              className="button secondary full-width"
              disabled={!selectedTextUnit || updateTextUnitTypesettingMutation.isPending}
              onClick={resetSelectedTextBoxToOcrRegion}
              type="button"
            >
              Reset box
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function MiniDictionary({
  characters,
  projectId,
  terms,
  selectedTextUnit,
}: {
  characters: Character[];
  projectId: string;
  terms: GlossaryTerm[];
  selectedTextUnit?: TextUnit;
}) {
  const warnings = terms.filter(
    (term) => selectedTextUnit && !selectedTextUnit.finalTranslation.includes(term.arabicTerm),
  );

  return (
    <div className="mini-dictionary">
      <div className="panel-title">
        <h2>Mini Dictionary</h2>
        <div>
          <Link
            className="icon-button"
            title="Open characters dictionary"
            to={`/projects/${projectId}?tab=dictionary&section=characters`}
          >
            <Plus size={15} />
          </Link>
          <Link
            className="icon-button"
            title="Open glossary dictionary"
            to={`/projects/${projectId}?tab=dictionary&section=glossary`}
          >
            <BookOpen size={15} />
          </Link>
        </div>
      </div>
      {characters.length === 0 && terms.length === 0 ? <p className="muted">No matches for selected text.</p> : null}
      {characters.map((character) => (
        <div className="dictionary-match" key={character.id}>
          <span>Character</span>
          <strong>{character.englishName}</strong>
          <em dir="rtl">{character.arabicName}</em>
          {character.aliases.length > 0 ? (
            <small title={character.aliases.map((alias) => `${alias.english} / ${alias.arabic}`).join(", ")}>
              {character.aliases.length} aliases
            </small>
          ) : null}
        </div>
      ))}
      {terms.map((term) => (
        <div className="dictionary-match" key={term.id}>
          <span>{term.category}</span>
          <strong>{term.englishTerm}</strong>
          <em dir="rtl">{term.arabicTerm}</em>
        </div>
      ))}
      {warnings.map((term) => (
        <div className="warning-line" key={term.id}>
          Expected term: <strong dir="rtl">{term.arabicTerm}</strong>
        </div>
      ))}
    </div>
  );
}

function TextUnitCard({
  isDeleting,
  unit,
  selected,
  onDelete,
  onSelect,
  onFinalChange,
  onSourceChange,
}: {
  isDeleting: boolean;
  unit: TextUnit;
  selected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  onFinalChange: (text: string) => void;
  onSourceChange: (sourceText: string, sourceStatus: OcrSourceStatus) => void;
}) {
  const [draft, setDraft] = useState(unit.finalTranslation);
  const [sourceDraft, setSourceDraft] = useState(unit.sourceText);
  const [sourceStatus, setSourceStatus] = useState<OcrSourceStatus>(unit.sourceStatus);

  useEffect(() => {
    setDraft(unit.finalTranslation);
  }, [unit.finalTranslation]);

  useEffect(() => {
    setSourceDraft(unit.sourceText);
    setSourceStatus(unit.sourceStatus);
  }, [unit.sourceStatus, unit.sourceText]);

  const confidence =
    typeof unit.ocrConfidence === "number" ? `${Math.round(unit.ocrConfidence * 100)}%` : "Unknown";
  const saveSource = (nextStatus = sourceStatus) => {
    onSourceChange(sourceDraft, nextStatus);
  };

  return (
    <article className={selected ? "text-unit-card selected" : "text-unit-card"} onClick={onSelect}>
      <div className="text-unit-head">
        <strong>#{unit.order}</strong>
        <div className="text-unit-head-actions">
          <span className={`status-chip ${statusClass(unit.sourceStatus)}`}>{unit.sourceStatus}</span>
          <button
            className="icon-button danger"
            disabled={isDeleting}
            title="Delete OCR result"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            {isDeleting ? <RefreshCw className="spin" size={15} /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>
      <div className="text-unit-meta">
        <span>{unit.ocrProvider ?? "Manual"}</span>
        <span>Confidence: {confidence}</span>
      </div>
      <label>Source / OCR</label>
      <textarea
        value={sourceDraft}
        onBlur={() => saveSource()}
        onChange={(event) => setSourceDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="text-unit-review-row" onClick={(event) => event.stopPropagation()}>
        <select
          className="field-select"
          value={sourceStatus}
          onChange={(event) => {
            const nextStatus = event.target.value as OcrSourceStatus;
            setSourceStatus(nextStatus);
            onSourceChange(sourceDraft, nextStatus);
          }}
        >
          {sourceStatusOptions.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setSourceStatus("Reviewed");
            saveSource("Reviewed");
          }}
        >
          <ClipboardCheck size={14} />
          Accept
        </button>
      </div>
      <label>AI Translation</label>
      <p dir="rtl">{unit.aiTranslation}</p>
      <label>Microsoft Translation</label>
      <p dir="rtl">{unit.microsoftTranslation}</p>
      <label>Final Translation</label>
      <textarea
        dir="rtl"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onFinalChange(draft)}
        onClick={(event) => event.stopPropagation()}
      />
    </article>
  );
}

function ToolGroup({
  title,
  tools,
  activeTool,
  setActiveTool,
}: {
  title: string;
  tools: [ActiveTool, typeof MousePointer2][];
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
}) {
  return (
    <div className="tool-panel">
      <h3>{title}</h3>
      <div className="tool-grid">
        {tools.map(([tool, Icon]) => (
          <button
            key={tool}
            className={activeTool === tool ? "tool-button active" : "tool-button"}
            onClick={() => setActiveTool(tool)}
            title={tool}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settings-grid">
        <SettingsCard icon={<Settings />} title="General" fields={["Interface language", "Density", "Theme"]} />
        <SettingsCard icon={<Eye />} title="OCR" fields={["Default provider", "Language hint", "Confidence threshold"]} />
        <SettingsCard icon={<Languages />} title="Translation" fields={["AI provider", "Microsoft Translator", "Use context"]} />
        <SettingsCard icon={<Database />} title="Storage" fields={["Workspace path", "Backup interval", "Cache size"]} />
        <SettingsCard icon={<Compass />} title="Sources" fields={["Enabled sources", "Refresh interval", "Import defaults"]} />
      </div>
    </section>
  );
}

function SettingsCard({ icon, title, fields }: { icon: ReactNode; title: string; fields: string[] }) {
  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <span className="stat-icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      {fields.map((field) => (
        <label className="settings-field" key={field}>
          <span>{field}</span>
          <input placeholder="Mock setting" />
        </label>
      ))}
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
