import { ArrowLeft, Compass, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getChapterForTranslation,
  getSourceChapterPages,
  getSourceTitleDetails,
  prepareSourceChapter,
  prepareLibraryChapter,
} from "../mock/api";
import type { Page } from "../types/domain";

type ReaderMode = "vertical" | "horizontal" | "rtl" | "webtoon";
type ReaderFitMode = "fit-width" | "fit-height" | "free";

interface ReaderPreferences {
  mode: ReaderMode;
  fitMode: ReaderFitMode;
  zoomPercent: number;
}

const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  mode: "vertical",
  fitMode: "fit-width",
  zoomPercent: 100,
};

function resolvePageScale(preferences: ReaderPreferences) {
  if (preferences.fitMode === "fit-height") {
    return { width: "auto", height: `${preferences.zoomPercent}%`, maxWidth: 'none', maxHeight: 'none' };
  }
  if (preferences.fitMode === "free") {
    return { width: `${preferences.zoomPercent}%`, height: "auto", maxWidth: 'none', maxHeight: 'none' };
  }
  return { width: `${preferences.zoomPercent}%`, height: "auto", maxWidth: 'none', maxHeight: 'none' };
}

export function ReaderPage() {
  const { projectId, sourceId, titleId, chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  
  const isSourceReader = Boolean(sourceId && titleId && chapterId && !projectId);

  const prepareChapterMutation = useMutation({
    mutationFn: (currentChapterId: string) => {
      if (isSourceReader) {
        return prepareSourceChapter(sourceId!, titleId!, currentChapterId);
      } else {
        return prepareLibraryChapter(currentChapterId);
      }
    },
    onSuccess: () => {
      // Refresh state to show downloaded badge or whatever, if any query depends on it
      queryClient.invalidateQueries({ queryKey: ["translation-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["source-title-details"] });
    },
  });
  
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

  const detailsHref = isSourceReader
    ? `/explorer/${encodeURIComponent(sourceId ?? "")}/${encodeURIComponent(titleId ?? "")}`
    : `/projects/${projectId ?? workspace?.project.id}`;

  const isPagedMode = preferences.mode === "horizontal" || preferences.mode === "rtl";
  const pageScale = resolvePageScale(preferences);

  // Chapter Navigation Logic
  const chapters = sourceDetailsQuery.data?.chapters ?? [];
  const currentChapterIndex = chapters.findIndex((c) => c.chapterId === chapterId);
  const olderChapter = currentChapterIndex > -1 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;
  const newerChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;

  function handleSelectChapter(newChapterId: string) {
    if (!newChapterId) return;
    if (isSourceReader) {
      navigate(`/reader/${encodeURIComponent(sourceId ?? "")}/${encodeURIComponent(titleId ?? "")}/${encodeURIComponent(newChapterId)}`);
    } else {
      navigate(`/workspace/${projectId ?? ""}/${encodeURIComponent(newChapterId)}`);
    }
  }

  function renderReaderSurface() {
    if (isLoading) {
      return <p className="browse-message" style={{ padding: '2rem', color: '#fff' }}>Loading chapter pages...</p>;
    }
    if (readablePages.length === 0) {
      return <p className="browse-message" style={{ padding: '2rem', color: '#fff' }}>No pages found.</p>;
    }

    if (isPagedMode) {
      return (
        <div className={`reader-stage reader-stage--paged reader-stage--${preferences.mode}`}>
           <div className="reader-paged-frame">
              <img
                className="reader-page reader-page--paged"
                src={readablePages[0].imageUrl ?? ""}
                alt={`Page`}
                style={pageScale}
              />
           </div>
        </div>
      );
    }

    return (
      <div className={`reader-stage reader-stage--scroll reader-stage--${preferences.mode}`}>
        <div className="reader-scroll-stack">
          {readablePages.map((page) => (
            <div key={page.id} className="reader-page-container">
              <img
                className={`reader-page reader-page--${preferences.mode}`}
                src={page.imageUrl ?? ""}
                alt={`Page ${page.index}`}
                style={pageScale}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="reader-layout">
      <aside className="reader-sidebar">
        <div style={{ padding: '0.5rem 1rem', marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="floirs-button floirs-button--icon"
            onClick={() => navigate('/explorer')}
            title="Explorer"
          >
            <Compass size={18} />
          </button>
          
          <button
            type="button"
            className="floirs-button floirs-button--icon"
            onClick={() => navigate(-1)}
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <section className="reader-panel">
          <label className="library-field">
            <span className="library-field__label">Mode</span>
            <select
              className="browse-controls__select"
              value={preferences.mode}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  mode: event.target.value as ReaderMode,
                }))
              }
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal paged</option>
              <option value="rtl">RTL paged</option>
              <option value="webtoon">Webtoon</option>
            </select>
          </label>

          <label className="library-field">
            <span className="library-field__label">Fit mode</span>
            <select
              className="browse-controls__select"
              value={preferences.fitMode}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  fitMode: event.target.value as ReaderFitMode,
                }))
              }
            >
              <option value="fit-width">Fit width</option>
              <option value="fit-height">Fit height</option>
              <option value="free">Free zoom</option>
            </select>
          </label>

          <label className="library-field">
            <span className="library-field__label">Zoom</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                className="reader-zoom-slider"
                type="range"
                min="50"
                max="200"
                step="5"
                value={preferences.zoomPercent}
                onChange={(e) => setPreferences({ ...preferences, zoomPercent: Number(e.target.value) })}
              />
              <span className="reader-zoom-pill">{preferences.zoomPercent}%</span>
            </div>
          </label>
        </section>

        <section className="reader-panel">
          <button
            type="button"
            className="floirs-button"
            style={{ marginBottom: '0.5rem' }}
            onClick={() => {
              navigate(detailsHref);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Manga Info
          </button>
          
          <button
            type="button"
            className="floirs-button"
            style={{ marginBottom: '0.5rem' }}
            onClick={() => {
              if (chapterId) prepareChapterMutation.mutate(chapterId);
            }}
            disabled={prepareChapterMutation.isPending || !chapterId}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            {prepareChapterMutation.isPending ? "Downloading..." : "Download"}
          </button>
          
          <label className="library-field">
            <select
              className="browse-controls__select"
              value={chapterId ?? ""}
              onChange={(event) => handleSelectChapter(event.target.value)}
            >
              <option value="" disabled>Select a chapter...</option>
              {chapters.map((chapter) => (
                <option 
                  key={chapter.chapterId} 
                  value={chapter.chapterId}
                >
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>

          <div className="reader-nav-row" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="floirs-button"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!olderChapter}
              onClick={() => olderChapter && handleSelectChapter(olderChapter.chapterId)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              Prev
            </button>
            <button
              type="button"
              className="floirs-button"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={!newerChapter}
              onClick={() => newerChapter && handleSelectChapter(newerChapter.chapterId)}
            >
              Next
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </section>
      </aside>

      <section className="reader-main">
        <section className="reader-content">
          {renderReaderSurface()}
        </section>
      </section>
    </div>
  );
}
