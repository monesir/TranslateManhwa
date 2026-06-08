import { ArrowLeft, BookOpen, Image as ImageIcon, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getChapterForTranslation,
  getSourceChapterPages,
  getSourceTitleDetails,
} from "../mock/api";
import type { Page } from "../types/domain";

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
  const { projectId, sourceId, titleId, chapterId } = useParams();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(100);
  const isSourceReader = Boolean(sourceId && titleId && chapterId && !projectId);
  const workspaceQuery = useQuery({
    queryKey: ["translation-workspace", chapterId],
    queryFn: () => getChapterForTranslation(chapterId ?? ""),
    enabled: Boolean(chapterId && !isSourceReader),
  });
  const sourceDetailsQuery = useQuery({
    queryKey: ["source-title-details", sourceId, titleId],
    queryFn: () => getSourceTitleDetails(sourceId ?? "", titleId ?? ""),
    enabled: isSourceReader,
  });
  const sourcePagesQuery = useQuery({
    queryKey: ["source-chapter-pages", sourceId, titleId, chapterId],
    queryFn: () => getSourceChapterPages(sourceId ?? "", titleId ?? "", chapterId ?? ""),
    enabled: isSourceReader,
  });

  const workspace = workspaceQuery.data;
  const sourceChapter = sourceDetailsQuery.data?.chapters.find(
    (chapter) => chapter.chapterId === chapterId,
  );
  const sourcePages = useMemo<Page[]>(
    () =>
      (sourcePagesQuery.data ?? []).map((page) => ({
        id: `source-page-${page.pageIndex}`,
        chapterId: chapterId ?? "",
        index: Number(page.pageIndex) + 1,
        imageTone: "night",
        imageUrl: page.imageUrl,
        width: 820,
        height: 1240,
      })),
    [chapterId, sourcePagesQuery.data],
  );
  const pages = useMemo(
    () => (isSourceReader ? sourcePages : workspace?.pages ?? []),
    [isSourceReader, sourcePages, workspace?.pages],
  );
  const readablePages = pages.filter((page) => page.imageUrl);
  const isLoading = isSourceReader
    ? sourceDetailsQuery.isLoading || sourcePagesQuery.isLoading
    : workspaceQuery.isLoading;
  const title = isSourceReader
    ? sourceDetailsQuery.data?.details.name
    : workspace?.project.title;
  const chapterLabel = isSourceReader
    ? sourceChapter?.title || sourceChapter?.availabilityLabel || chapterId
    : workspace?.chapter.displayLabel;
  const detailsHref = isSourceReader
    ? `/explorer/${encodeURIComponent(sourceId ?? "")}/${encodeURIComponent(titleId ?? "")}`
    : `/projects/${projectId ?? workspace?.project.id}`;

  if (isLoading) {
    return <ReaderStatePanel label="Loading chapter" loading />;
  }

  if (isSourceReader && !sourceDetailsQuery.data) {
    return <ReaderStatePanel label="Source chapter not found" />;
  }

  if (isSourceReader && sourcePagesQuery.isError) {
    const message =
      sourcePagesQuery.error instanceof Error
        ? sourcePagesQuery.error.message
        : "Could not load source chapter pages";
    return <ReaderStatePanel label={message} />;
  }

  if (!isSourceReader && !workspace) {
    return <ReaderStatePanel label="Chapter not found" />;
  }

  return (
    <section className="reader-screen">
      <header className="reader-topbar">
        <button className="icon-button" onClick={() => navigate(-1)} title="Back">
          <ArrowLeft size={17} />
        </button>
        <div className="reader-title">
          <strong>{title}</strong>
          <span>{chapterLabel}</span>
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
        <Link className="button secondary reader-project-link" to={detailsHref}>
          {isSourceReader ? "Series" : "Project"}
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
