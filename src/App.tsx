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
  Type,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getChapterForTranslation,
  getExplorerSeriesDetails,
  getLibraryStats,
  getProjectDictionary,
  getProjectOverview,
  listExplorerSeries,
  listProjectChapters,
  listProjects,
  updateFinalTranslation,
} from "./mock/api";
import type {
  ActiveTool,
  Chapter,
  Character,
  GlossaryTerm,
  Project,
  ProjectOverview,
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
          <span>Local UI build</span>
          <strong>Mock data</strong>
        </div>
      </aside>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/explorer/:externalSeriesId" element={<ExplorerDetailsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route
            path="/projects/:projectId/chapters/:chapterId/translate"
            element={<TranslationPage />}
          />
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
      <CoverArt tone={project.coverTone} title={project.title} />
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
  const seriesQuery = useQuery({ queryKey: ["explorer"], queryFn: listExplorerSeries });
  const series = (seriesQuery.data ?? []).filter((item) =>
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
        <button className="source-tab active">All sources</button>
        <button className="source-tab">Korean Archive</button>
        <button className="source-tab">Webtoon Index</button>
        <button className="source-tab">Local import</button>
      </div>

      {seriesQuery.isLoading ? <LoadingPanel label="Loading explorer" /> : null}
      {!seriesQuery.isLoading && series.length === 0 ? <EmptyPanel label="No series found" /> : null}

      <div className="explorer-grid">
        {series.map((item) => (
          <Link className="series-card" key={item.externalSeriesId} to={`/explorer/${item.externalSeriesId}`}>
            <CoverArt tone={item.coverTone} title={item.title} />
            <div>
              <div className="series-card-head">
                <h2>{item.title}</h2>
                {item.inLibrary ? <span className="status-chip active">In library</span> : null}
              </div>
              <p>{item.originalTitle}</p>
              <div className="tag-row">
                {item.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
              <div className="series-foot">
                <span>{item.sourceName}</span>
                <strong>{item.latestChapter}</strong>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ExplorerDetailsPage() {
  const { externalSeriesId } = useParams();
  const navigate = useNavigate();
  const detailsQuery = useQuery({
    queryKey: ["explorer-details", externalSeriesId],
    queryFn: () => getExplorerSeriesDetails(externalSeriesId ?? ""),
  });

  const details = detailsQuery.data;
  if (detailsQuery.isLoading) return <LoadingPanel label="Loading series" />;
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
            {details.inLibrary ? (
              <button className="button secondary" onClick={() => navigate("/projects/project_solo_leveling")}>
                <LibraryIcon size={16} />
                Open in Library
              </button>
            ) : null}
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
              <button className="icon-button" title="Prepare chapter">
                <Download size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectPage() {
  const { projectId } = useParams();
  const [tab, setTab] = useState<"overview" | "chapters" | "dictionary">("overview");
  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId ?? ""),
  });

  const overview = overviewQuery.data;
  if (overviewQuery.isLoading) return <LoadingPanel label="Loading project" />;
  if (!overview) return <EmptyPanel label="Project not found" />;

  return (
    <section className="page">
      <header className="project-hero">
        <CoverArt tone={overview.coverTone} title={overview.title} />
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
        <Link className="button primary hero-action" to={`/projects/${overview.id}/chapters/${overview.lastWorkedChapterId}/translate`}>
          <Edit3 size={16} />
          Open last chapter
        </Link>
      </header>

      <div className="tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "chapters" ? "active" : ""} onClick={() => setTab("chapters")}>
          Chapters
        </button>
        <button className={tab === "dictionary" ? "active" : ""} onClick={() => setTab("dictionary")}>
          Dictionary
        </button>
      </div>

      {tab === "overview" ? <OverviewTab overview={overview} /> : null}
      {tab === "chapters" ? <ChaptersTab projectId={overview.id} /> : null}
      {tab === "dictionary" ? <DictionaryTab projectId={overview.id} /> : null}
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
  const chaptersQuery = useQuery({
    queryKey: ["project-chapters", projectId],
    queryFn: () => listProjectChapters(projectId),
  });

  if (chaptersQuery.isLoading) return <LoadingPanel label="Loading chapters" />;
  const rows = chaptersQuery.data ?? [];

  return (
    <div className="table-card">
      <div className="table-title">
        <h2>Chapters</h2>
        <span>{rows.length} chapters</span>
      </div>
      <div className="chapter-list">
        {rows.map((chapter) => (
          <ChapterRow key={chapter.id} chapter={chapter} />
        ))}
      </div>
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: Chapter }) {
  return (
    <div className="chapter-row">
      <strong>{chapter.displayLabel}</strong>
      <span>{chapter.title ?? "Untitled"}</span>
      <span className={`status-chip ${statusClass(chapter.status)}`}>{chapter.status}</span>
      <span className="internal-status">{chapter.internalStatus}</span>
      <span>{chapter.pagesCount} pages</span>
      <span>{chapter.textUnitsCount} text units</span>
      <div className="row-progress">
        <ProgressBar value={chapter.progress} />
        <small>{chapter.progress}%</small>
      </div>
      <Link className="icon-button" to={`/projects/${chapter.projectId}/chapters/${chapter.id}/translate`} title="Open translation">
        <Edit3 size={16} />
      </Link>
    </div>
  );
}

function DictionaryTab({ projectId }: { projectId: string }) {
  const [section, setSection] = useState<"characters" | "glossary">("characters");
  const [newCategory, setNewCategory] = useState("");
  const dictionaryQuery = useQuery({
    queryKey: ["project-dictionary", projectId],
    queryFn: () => getProjectDictionary(projectId),
  });

  if (dictionaryQuery.isLoading) return <LoadingPanel label="Loading dictionary" />;
  const dictionary = dictionaryQuery.data;
  if (!dictionary) return <EmptyPanel label="Dictionary unavailable" />;

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

      {section === "characters" ? (
        <div className="table-card">
          <div className="table-title">
            <h2>Characters</h2>
            <button className="button secondary">
              <Plus size={16} />
              Add character
            </button>
          </div>
          <div className="dictionary-table characters-table">
            <div className="dictionary-head">
              <span>English Name</span>
              <span>Arabic Name</span>
              <span>Gender</span>
              <span>Aliases</span>
              <span>Description</span>
            </div>
            {dictionary.characters.map((character) => (
              <div className="dictionary-row" key={character.id}>
                <strong>{character.englishName}</strong>
                <span dir="rtl">{character.arabicName}</span>
                <span>{character.gender}</span>
                <span>
                  {character.aliases.map((alias) => `${alias.english} / ${alias.arabic}`).join(", ") || "None"}
                </span>
                <span>{character.description ?? "No description"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-title">
            <h2>General Glossary</h2>
            <div className="inline-form">
              <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" />
              <button className="button secondary" onClick={() => setNewCategory("")}>
                <Plus size={16} />
                Add Category
              </button>
            </div>
          </div>
          <div className="category-row">
            {dictionary.categories.map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
          </div>
          <div className="dictionary-table terms-table">
            <div className="dictionary-head">
              <span>English Term</span>
              <span>Arabic Term</span>
              <span>Category</span>
              <span>Description</span>
            </div>
            {dictionary.glossaryTerms.map((term) => (
              <div className="dictionary-row" key={term.id}>
                <strong>{term.englishTerm}</strong>
                <span dir="rtl">{term.arabicTerm}</span>
                <span>{term.categoryName}</span>
                <span>{term.description ?? "No description"}</span>
              </div>
            ))}
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

  useEffect(() => {
    if (!workspace) return;
    if (!selectedPageId) setSelectedPageId(workspace.pages[0]?.id);
    if (!selectedTextUnitId) setSelectedTextUnitId(workspace.textUnits[0]?.id);
  }, [workspace, selectedPageId, selectedTextUnitId, setSelectedPageId, setSelectedTextUnitId]);

  if (workspaceQuery.isLoading) return <LoadingPanel label="Loading translation workspace" />;
  if (!workspace) return <EmptyPanel label="Chapter not found" />;

  const currentPage = workspace.pages.find((page) => page.id === selectedPageId) ?? workspace.pages[0];
  const pageTextUnits = workspace.textUnits.filter((unit) => unit.pageId === currentPage?.id);
  const selectedTextUnit =
    workspace.textUnits.find((unit) => unit.id === selectedTextUnitId) ?? workspace.textUnits[0];

  const matchedCharacters = workspace.characters.filter((character) =>
    selectedTextUnit?.matchedCharacterIds.includes(character.id),
  );
  const matchedTerms = workspace.glossaryTerms.filter((term) =>
    selectedTextUnit?.matchedGlossaryTermIds.includes(term.id),
  );

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
                onSelect={() => {
                  setSelectedTextUnitId(unit.id);
                  setSelectedPageId(unit.pageId);
                }}
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
            <div className="page-switcher">
              {workspace.pages.map((page) => (
                <button
                  key={page.id}
                  className={page.id === currentPage.id ? "active" : ""}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  {page.index}
                </button>
              ))}
            </div>
          </div>

          <div className="page-stage">
            <div
              className={`mock-page page-tone-${currentPage.imageTone}`}
              style={{
                width: currentPage.width * zoom,
                height: currentPage.height * zoom,
              }}
            >
              <div className="mock-panel panel-a" />
              <div className="mock-panel panel-b" />
              <div className="mock-panel panel-c" />
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
          <span>{term.categoryName}</span>
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
