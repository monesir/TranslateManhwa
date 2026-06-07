import { ArrowLeft, BookOpen, Image as ImageIcon, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getChapterForTranslation } from "../mock/api";

const MIN_ZOOM = 70;
const MAX_ZOOM = 140;
const ZOOM_STEP = 10;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function ReaderStatePanel({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <div className="reader-state-panel">
      {loading ? <RefreshCw className="spin" size={20} /> : <ImageIcon size={20} />}
      <span>{label}</span>
    </div>
  );
}

export function ReaderPage() {
  const { projectId, chapterId } = useParams();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(100);
  const workspaceQuery = useQuery({
    queryKey: ["translation-workspace", chapterId],
    queryFn: () => getChapterForTranslation(chapterId ?? ""),
    enabled: Boolean(chapterId),
  });

  const workspace = workspaceQuery.data;
  const pages = useMemo(() => workspace?.pages ?? [], [workspace?.pages]);
  const readablePages = pages.filter((page) => page.imageUrl);

  if (workspaceQuery.isLoading) {
    return <ReaderStatePanel label="Loading chapter" loading />;
  }

  if (!workspace) {
    return <ReaderStatePanel label="Chapter not found" />;
  }

  return (
    <section className="reader-screen">
      <header className="reader-topbar">
        <button className="icon-button" onClick={() => navigate(-1)} title="Back">
          <ArrowLeft size={17} />
        </button>
        <div className="reader-title">
          <strong>{workspace.project.title}</strong>
          <span>{workspace.chapter.displayLabel}</span>
        </div>
        <div className="reader-count">
          <BookOpen size={16} />
          {readablePages.length} pages
        </div>
        <div className="reader-zoom">
          <button
            className="icon-button"
            onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span>{zoom}%</span>
          <button
            className="icon-button"
            onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <Link className="button secondary reader-project-link" to={`/projects/${projectId ?? workspace.project.id}`}>
          Project
        </Link>
      </header>

      <div className="reader-stage">
        {readablePages.length > 0 ? (
          <div className="reader-page-stack" style={{ "--reader-zoom": `${zoom}%` } as CSSProperties}>
            {readablePages.map((page) => (
              <figure className="reader-page" key={page.id}>
                <img src={page.imageUrl ?? ""} alt={`Page ${page.index}`} loading="lazy" />
                <figcaption>Page {page.index}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <ReaderStatePanel label="This chapter has no prepared page images" />
        )}
      </div>
    </section>
  );
}
