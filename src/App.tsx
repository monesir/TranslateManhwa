import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
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
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReaderPage } from "./pages/ReaderPage";
import {
  addCharacter,
  addGlossaryTerm,
  browseSourceTitles,
  deleteCharacter,
  deleteGlossaryTerm,
  ensureSourceProject,
  getChapterForTranslation,
  getExplorerSeriesDetails,
  getLibraryStats,
  getProjectDictionary,
  getProjectOverview,
  getSourceTitleDetails,
  listExplorerSeries,
  listProjectChapters,
  listProjects,
  listSourceCatalog,
  prepareLibraryChapter,
  prepareSourceChapter,
  searchSourceTitles,
  updateCharacter,
  updateFinalTranslation,
  updateGlossaryTerm,
} from "./mock/api";
import type {
  ActiveTool,
  Chapter,
  Character,
  CharacterAliasInput,
  CharacterInput,
  Gender,
  GlossaryTermInput,
  GlossaryTerm,
  Project,
  ProjectOverview,
  SourceChapterSummary,
  SourceTitleSummary,
  TextUnit,
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

function AppShell() {
  const runtimeLabel = window.florisApi ? "Electron runtime" : "Local UI build";
  const dataLabel = window.florisApi ? "SQLite data" : "No SQLite connection";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>Floris</strong>
            <span>Translator</span>
          </div>
        </div>

        <nav className="main-nav">
          <NavLink to="/library">
            <LibraryIcon size={18} />
            Library
          </NavLink>
          <NavLink to="/explorer">
            <Compass size={18} />
            Explorer
          </NavLink>
          <NavLink to="/settings">
            <Settings size={18} />
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-status">
          <span>{runtimeLabel}</span>
          <strong>{dataLabel}</strong>
        </div>
      </aside>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
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
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const statsQuery = useQuery({ queryKey: ["library-stats"], queryFn: getLibraryStats });

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
          <button className="button primary">
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
    </section>
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
          <strong>{project.lastWorkedChapterLabel}</strong>
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
  const [query, setQuery] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim();

  const catalogQuery = useQuery({ queryKey: ["source-catalog"], queryFn: listSourceCatalog });
  const sources = catalogQuery.data ?? [];

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      setSelectedSourceId(sources[0].metadata.sourceId);
    }
  }, [selectedSourceId, sources]);

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
            onClick={() => setSelectedSourceId(source.metadata.sourceId)}
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
      navigate(`/projects/${result.projectId}/chapters/${result.chapterId}/read`);
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
                  : "Could not prepare chapter"}
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
                isPreparing={
                  prepareChapterMutation.isPending &&
                  prepareChapterMutation.variables === chapter.chapterId
                }
                onPrepare={() => prepareChapterMutation.mutate(chapter.chapterId)}
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
  isPreparing,
  onPrepare,
}: {
  chapter: SourceChapterSummary;
  isPreparing: boolean;
  onPrepare: () => void;
}) {
  return (
    <button
      className="chapter-row chapter-row-button"
      type="button"
      disabled={chapter.availability !== "readable" || isPreparing}
      onClick={onPrepare}
    >
      <strong>{chapter.chapterNumber == null ? "Chapter" : `Chapter ${chapter.chapterNumber}`}</strong>
      <span>{chapter.title || "Untitled"}</span>
      <span className={`status-chip ${statusClass(chapter.availability)}`}>
        {isPreparing ? "Loading" : chapter.availabilityLabel ?? chapter.availability}
      </span>
    </button>
  );
}

function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "chapters" | "dictionary">("chapters");
  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId ?? ""),
  });

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
        <button className={tab === "chapters" ? "active" : ""} onClick={() => setTab("chapters")}>
          Chapters
        </button>
        <button className={tab === "dictionary" ? "active" : ""} onClick={() => setTab("dictionary")}>
          Dictionary
        </button>
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
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
  const chaptersQuery = useQuery({
    queryKey: ["project-chapters", projectId],
    queryFn: () => listProjectChapters(projectId),
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

  if (chaptersQuery.isLoading) return <LoadingPanel label="Loading chapters" />;
  const rows = chaptersQuery.data ?? [];

  return (
    <div className="table-card">
      <div className="table-title">
        <h2>Chapters</h2>
        <span>{rows.length} chapters</span>
      </div>
      {prepareChapterMutation.isError ? (
        <p className="error-line">
          {prepareChapterMutation.error instanceof Error
            ? prepareChapterMutation.error.message
            : "Could not prepare chapter"}
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
      <span className="internal-status">{isPreparing ? "Preparing pages" : chapter.internalStatus}</span>
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
  const [section, setSection] = useState<"characters" | "glossary">("characters");
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
        <button className={section === "characters" ? "active" : ""} onClick={() => setSection("characters")}>
          Characters
        </button>
        <button className={section === "glossary" ? "active" : ""} onClick={() => setSection("glossary")}>
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
  const [viewerMode, setViewerMode] = useState<"page" | "webtoon">("page");
  const [mergePages, setMergePages] = useState(false);
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

  const mutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => updateFinalTranslation(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", chapterId] });
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
    });
  }, [selectedPageId, viewerMode]);

  if (workspaceQuery.isLoading) return <LoadingPanel label="Loading translation workspace" />;
  if (!workspace) return <EmptyPanel label="Chapter not found" />;
  if (workspace.pages.length === 0) return <EmptyPanel label="Chapter pages are not prepared yet" />;

  const currentPage = workspace.pages.find((page) => page.id === selectedPageId) ?? workspace.pages[0];
  const pageTextUnits = textUnitsByPage.get(currentPage.id) ?? [];
  const selectedTextUnit =
    workspace.textUnits.find((unit) => unit.id === selectedTextUnitId) ?? workspace.textUnits[0];

  const matchedCharacters = workspace.characters.filter((character) =>
    selectedTextUnit?.matchedCharacterIds.includes(character.id),
  );
  const matchedTerms = workspace.glossaryTerms.filter((term) =>
    selectedTextUnit?.matchedGlossaryTermIds.includes(term.id),
  );
  const selectPage = (pageId: string) => {
    setSelectedPageId(pageId);
    if (viewerMode === "webtoon") {
      window.requestAnimationFrame(() => {
        pageRefs.current[pageId]?.scrollIntoView({ block: "start" });
      });
    }
  };
  const selectTextUnit = (unit: TextUnit) => {
    setSelectedTextUnitId(unit.id);
    selectPage(unit.pageId);
  };

  return (
    <section className="translation-screen">
      <header className="translation-topbar">
        <button className="icon-button" onClick={() => navigate(`/projects/${projectId}`)} title="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <strong>{workspace.project.title}</strong>
          <span>{workspace.chapter.displayLabel} / {workspace.chapter.internalStatus}</span>
        </div>
        <div className="topbar-actions">
          <button className="button secondary"><Wand2 size={15} />Run OCR</button>
          <button className="button secondary"><Sparkles size={15} />AI Translate</button>
          <button className="button secondary"><Languages size={15} />Microsoft</button>
          <button className="button secondary"><ShieldCheck size={15} />Quality</button>
          <button className="button primary"><Download size={15} />Export</button>
        </div>
      </header>

      <div className="translation-layout">
        <aside className="translation-left">
          <MiniDictionary characters={matchedCharacters} terms={matchedTerms} selectedTextUnit={selectedTextUnit} />
          <div className="text-unit-list">
            {workspace.textUnits.map((unit) => (
              <TextUnitCard
                key={unit.id}
                unit={unit}
                selected={unit.id === selectedTextUnit?.id}
                onSelect={() => selectTextUnit(unit)}
                onFinalChange={(text) => mutation.mutate({ id: unit.id, text })}
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

          <div className={viewerMode === "webtoon" ? "page-stage webtoon-stage" : "page-stage"}>
            {viewerMode === "page" ? (
              <div
                className={`mock-page page-tone-${currentPage.imageTone}`}
                style={{
                  width: currentPage.width * zoom,
                  height: currentPage.height * zoom,
                }}
              >
                {isRenderableImageUrl(currentPage.imageUrl) ? (
                  <img className="page-image" src={currentPage.imageUrl ?? ""} alt={`Page ${currentPage.index}`} />
                ) : (
                  <>
                    <div className="mock-panel panel-a" />
                    <div className="mock-panel panel-b" />
                    <div className="mock-panel panel-c" />
                  </>
                )}
                <svg className="region-layer" viewBox={`0 0 ${currentPage.width} ${currentPage.height}`}>
                  {pageTextUnits.map((unit) => (
                    <rect
                      key={unit.id}
                      x={unit.region.x}
                      y={unit.region.y}
                      width={unit.region.width}
                      height={unit.region.height}
                      rx={12}
                      className={unit.id === selectedTextUnit?.id ? "region selected" : "region"}
                      onClick={() => setSelectedTextUnitId(unit.id)}
                    />
                  ))}
                </svg>
              </div>
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
                      <div
                        className={`mock-page webtoon-page-surface page-tone-${page.imageTone}`}
                        style={{
                          width: page.width * zoom,
                          height: page.height * zoom,
                        }}
                      >
                        {isRenderableImageUrl(page.imageUrl) ? (
                          <img className="page-image" src={page.imageUrl ?? ""} alt={`Page ${page.index}`} />
                        ) : (
                          <>
                            <div className="mock-panel panel-a" />
                            <div className="mock-panel panel-b" />
                            <div className="mock-panel panel-c" />
                          </>
                        )}
                        <svg className="region-layer" viewBox={`0 0 ${page.width} ${page.height}`}>
                          {units.map((unit) => (
                            <rect
                              key={unit.id}
                              x={unit.region.x}
                              y={unit.region.y}
                              width={unit.region.width}
                              height={unit.region.height}
                              rx={12}
                              className={unit.id === selectedTextUnit?.id ? "region selected" : "region"}
                              onClick={() => selectTextUnit(unit)}
                            />
                          ))}
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
        </aside>
      </div>
    </section>
  );
}

function MiniDictionary({
  characters,
  terms,
  selectedTextUnit,
}: {
  characters: Character[];
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
          <button className="icon-button" title="Add character"><Plus size={15} /></button>
          <button className="icon-button" title="Add term"><BookOpen size={15} /></button>
        </div>
      </div>
      {characters.length === 0 && terms.length === 0 ? <p className="muted">No matches for selected text.</p> : null}
      {characters.map((character) => (
        <div className="dictionary-match" key={character.id}>
          <span>Character</span>
          <strong>{character.englishName}</strong>
          <em dir="rtl">{character.arabicName}</em>
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
  unit,
  selected,
  onSelect,
  onFinalChange,
}: {
  unit: TextUnit;
  selected: boolean;
  onSelect: () => void;
  onFinalChange: (text: string) => void;
}) {
  const [draft, setDraft] = useState(unit.finalTranslation);

  useEffect(() => {
    setDraft(unit.finalTranslation);
  }, [unit.finalTranslation]);

  return (
    <article className={selected ? "text-unit-card selected" : "text-unit-card"} onClick={onSelect}>
      <div className="text-unit-head">
        <strong>#{unit.order}</strong>
        <span className={`status-chip ${statusClass(unit.reviewStatus)}`}>{unit.reviewStatus}</span>
      </div>
      <label>Source / OCR</label>
      <p>{unit.sourceText}</p>
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
