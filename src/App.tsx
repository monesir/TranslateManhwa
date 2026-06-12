import {
  ArrowLeft,
  ArrowUpDown,
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
  Eraser,
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
  Pipette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Undo2,
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
  addPageEditMark,
  addCharacter,
  addGlossaryTerm,
  browseSourceTitles,
  cleanPageText,
  createProjectChapter,
  createProject,
  deleteCharacter,
  deleteGlossaryTerm,
  deleteOcrResults,
  deletePageEditMark,
  deleteTextUnit,
  ensureSourceProject,
  exportChapter,
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
  mergeChapterPages,
  pickChapterImages,
  prepareLibraryChapter,
  prepareSourceChapter,
  removeMergedPages,
  restoreCleanPatchArea,
  runOcrForChapter,
  runOcrForPage,
  runOcrForRegion,
  samplePageColor,
  searchSourceTitles,
  updateCharacter,
  updateChapterTextSize,
  updateFinalTranslation,
  updateGlossaryTerm,
  updateTextUnitSource,
  updateTextUnitTypesetting,
  translateWithAi,
  translateWithMicrosoft,
} from "./mock/api";
import type {
  ActiveTool,
  Chapter,
  ChapterTranslationWorkspace,
  Character,
  CharacterAliasInput,
  CharacterInput,
  CleanProviderId,
  CreateChapterInput,
  CreateProjectInput,
  Gender,
  GlossaryTermInput,
  GlossaryTerm,
  CleanPolicy,
  OcrRegionExpansion,
  OcrRegionRunOptions,
  OcrProviderId,
  OcrRunResult,
  OcrRunOptions,
  OcrSourceStatus,
  Page,
  PageEditMark,
  PageEditMarkInput,
  PageEditPoint,
  PageCleanTextInput,
  Project,
  ProjectOverview,
  RegionBox,
  RestoreCleanPatchAreaResult,
  SourceCatalogItem,
  SourceChapterSummary,
  SourceTitleSummary,
  TextUnit,
  TextUnitTypesettingInput,
  TranslationLevel,
} from "./types/domain";
import { useTranslationWorkspaceStore } from "./stores/translation-workspace-store";

function formatDate(value: string | undefined | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function isAutoCleanPatch(mark: PageEditMark) {
  if (mark.kind !== "clean_patch") return false;
  return (
    mark.cleanMode === "auto_after_ocr" ||
    mark.cleanSource === "ocr_page" ||
    mark.cleanSource === "ocr_region" ||
    mark.cleanSource === "ocr_chapter" ||
    Boolean(mark.sourceOcrRunId)
  );
}

function ocrResultStatus(result: OcrRunResult) {
  const cleanPatches = result.cleanPatchesCreated ?? 0;
  const cleanSkipped = result.cleanSkipped ?? 0;
  const cleanFallbacks = result.cleanFallbacksApplied ?? 0;
  const cleanErrors = result.cleanErrors?.length ? `, ${result.cleanErrors.length} clean errors` : "";
  const fallbackText = cleanFallbacks > 0 ? `, fallback ${cleanFallbacks}` : "";
  if (cleanPatches > 0 || cleanSkipped > 0 || cleanFallbacks > 0 || cleanErrors) {
    return `OCR created ${result.textUnitsCreated} text units. Auto-clean applied ${cleanPatches}, skipped ${cleanSkipped}${fallbackText}${cleanErrors}.`;
  }
  return `OCR created ${result.textUnitsCreated} text units.`;
}

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
type HenryTranslationProvider = "microsoft" | "ai";
type TypesetTranslationSource = "default" | HenryTranslationProvider;

interface TextBoxDragState {
  currentBox: RegionBox;
  didMove: boolean;
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

interface DrawStrokeState {
  pageId: string;
  points: PageEditPoint[];
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

function intersectRegionBoxes(first: RegionBox | null | undefined, second: RegionBox | null | undefined): RegionBox | null {
  if (!first || !second) return null;
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return {
    type: "box",
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
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
const MAX_TEXT_UNIT_FONT_SIZE = 360;
const TEXT_UNIT_FONT_STEP = 2;
const MIN_TEXT_BOX_WIDTH = 16;
const MIN_TEXT_BOX_HEIGHT = 12;
const AUTO_TYPESET_MIN_PADDING_X = 10;
const AUTO_TYPESET_MAX_PADDING_X = 72;
const AUTO_TYPESET_MIN_PADDING_Y = 6;
const AUTO_TYPESET_MAX_PADDING_Y = 48;
const TYPESET_DARK_TEXT_COLOR = "#17110B";
const TYPESET_LIGHT_TEXT_COLOR = "#F7F2E8";
const TYPESET_BACKGROUND_DARK_LUMINANCE = 112;
const TYPESET_FIT_GUARD_PX = 2;
const TYPESET_CANVAS_FONT_FAMILY = '"JF Flat", "Segoe UI", Tahoma, Arial, sans-serif';
const TYPESET_MEASURE_LINE_HEIGHT = 1.28;
const TYPESET_MEASURE_PADDING_X = 5;
const TYPESET_MEASURE_PADDING_Y = 4;
const AUTO_PASTE_BOX_COMFORT_SCALE_X = 1.08;
const AUTO_PASTE_BOX_COMFORT_SCALE_Y = 1.08;
const SINGLE_WORD_AUTO_PASTE_FONT_SCALE = 1.18;
const SINGLE_WORD_AUTO_PASTE_MAX_EXTRA = 8;
const TYPESET_VISUAL_SIZE_FACTOR = 1.72;
const TYPESET_FORCE_SCALE = 1.85;
const TYPESET_RENDER_SCALE = 2.35;
const MIN_BRUSH_SIZE = 2;
const MAX_BRUSH_SIZE = 96;
const DEFAULT_BRUSH_SIZE = 34;
const DEFAULT_BRUSH_COLOR = "#FFFFFF";
const MIN_CLEAN_STRENGTH = 1;
const MAX_CLEAN_STRENGTH = 12;
const DEFAULT_CLEAN_STRENGTH = 4;
const MAX_CLEAN_MASK_EXPANSION = 18;
const MAX_CLEAN_FEATHER = 16;
const HENRY_AUTO_CLEAN_MASK_EXPANSION = 10;
const MIN_PAGE_WORKERS = 1;
const MAX_PAGE_WORKERS = 12;
const TEXT_BOX_DRAG_THRESHOLD_PX = 3;

function clampTextUnitFontSize(value: number) {
  if (!Number.isFinite(value)) return 18;
  return Math.max(MIN_TEXT_UNIT_FONT_SIZE, Math.min(MAX_TEXT_UNIT_FONT_SIZE, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
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

function getAutoTypesetText(unit: TextUnit, source: TypesetTranslationSource = "default") {
  const candidateOrder = source === "ai"
    ? [unit.finalTranslation, unit.aiTranslation, unit.microsoftTranslation]
    : [unit.finalTranslation, unit.microsoftTranslation, unit.aiTranslation];
  return candidateOrder
    .map((text) => text.trim())
    .find((text) => text.length > 0) ?? "";
}

function getOverlayText(unit: TextUnit) {
  return getAutoTypesetText(unit);
}

function isSingleWordAutoPasteText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.includes(" ")) return false;
  const withoutEdgePunctuation = normalized.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
  return withoutEdgePunctuation.length > 0 && /[\p{L}\p{N}]/u.test(withoutEdgePunctuation);
}

function boostSingleWordAutoPasteFontSize(text: string, fontSize: number) {
  if (!isSingleWordAutoPasteText(text)) return fontSize;
  const scaled = Math.round(fontSize * SINGLE_WORD_AUTO_PASTE_FONT_SCALE);
  return clampTextUnitFontSize(Math.min(fontSize + SINGLE_WORD_AUTO_PASTE_MAX_EXTRA, scaled));
}

function expandAutoTypesetRegion(unit: TextUnit, page: Page, source: TypesetTranslationSource = "default"): RegionBox {
  const translatedText = getAutoTypesetText(unit, source);
  const sourceLength = Math.max(1, unit.sourceText.trim().length);
  const targetLength = Math.max(1, translatedText.length);
  const compactTargetLength = Math.max(1, translatedText.replace(/\s+/g, "").length);
  const sourceLineCount = Math.max(1, unit.sourceText.trim().split(/\r?\n/).filter(Boolean).length);
  const targetLineCount = Math.max(1, translatedText.trim().split(/\r?\n/).filter(Boolean).length);
  const lengthRatio = clampNumber(targetLength / sourceLength, 1, 2.4);
  const shortTextPadBoost = compactTargetLength <= 4 ? 20 : compactTargetLength <= 8 ? 14 : 0;
  const multilinePadBoost = Math.max(0, targetLineCount - sourceLineCount) * 8;
  const padX = clampNumber(
    unit.region.width * 0.16 + (lengthRatio - 1) * 14 + shortTextPadBoost,
    AUTO_TYPESET_MIN_PADDING_X,
    AUTO_TYPESET_MAX_PADDING_X,
  );
  const padY = clampNumber(
    unit.region.height * 0.18 + (lengthRatio - 1) * 10 + multilinePadBoost,
    AUTO_TYPESET_MIN_PADDING_Y,
    AUTO_TYPESET_MAX_PADDING_Y,
  );

  return clampTextBoxToPage({
    type: "box",
    x: unit.region.x - padX,
    y: unit.region.y - padY,
    width: unit.region.width + padX * 2,
    height: unit.region.height + padY * 2,
  }, page);
}

function wrapMeasuredText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const lines: string[] = [];
  const paragraphs = text
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function measureAutoTypesetFontSizeWithCanvas(text: string, box: RegionBox) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const maxWidth = Math.max(1, box.width - TYPESET_MEASURE_PADDING_X * 2);
  const maxHeight = Math.max(1, box.height - TYPESET_MEASURE_PADDING_Y * 2);
  let low = MIN_TEXT_UNIT_FONT_SIZE;
  let high = MAX_TEXT_UNIT_FONT_SIZE;
  let best = MIN_TEXT_UNIT_FONT_SIZE;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const renderedFontSize = mid * TYPESET_RENDER_SCALE;
    context.font = `800 ${renderedFontSize}px ${TYPESET_CANVAS_FONT_FAMILY}`;
    const lines = wrapMeasuredText(context, text, maxWidth);
    const widest = Math.max(...lines.map((line) => context.measureText(line).width), 0);
    const totalHeight = lines.length * renderedFontSize * TYPESET_MEASURE_LINE_HEIGHT;
    if (lines.length > 0 && widest <= maxWidth + 1 && totalHeight <= maxHeight + 1) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return clampTextUnitFontSize(best);
}

function expandRegionAroundCenter(box: RegionBox, page: Page, width: number, height: number): RegionBox {
  const nextWidth = Math.min(page.width, Math.max(MIN_TEXT_BOX_WIDTH, width));
  const nextHeight = Math.min(page.height, Math.max(MIN_TEXT_BOX_HEIGHT, height));
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return {
    type: "box",
    x: Math.max(0, Math.min(page.width - nextWidth, centerX - nextWidth / 2)),
    y: Math.max(0, Math.min(page.height - nextHeight, centerY - nextHeight / 2)),
    width: nextWidth,
    height: nextHeight,
  };
}

function addAutoPasteComfortToBox(box: RegionBox, page: Page) {
  return expandRegionAroundCenter(
    box,
    page,
    box.width * AUTO_PASTE_BOX_COMFORT_SCALE_X,
    box.height * AUTO_PASTE_BOX_COMFORT_SCALE_Y,
  );
}

function estimateVisualAutoTypesetFontSize(text: string, box: RegionBox) {
  const compactText = text.replace(/\s+/g, "");
  const visualLength = Math.max(1, compactText.length + (text.length - compactText.length) * 0.35);
  const areaFont = Math.sqrt(Math.max(1, box.width * box.height) / visualLength) * TYPESET_VISUAL_SIZE_FACTOR;
  const heightFloor = box.height * (visualLength <= 24 ? 0.42 : visualLength <= 56 ? 0.32 : 0.24);
  const heightCap = box.height * (visualLength <= 24 ? 0.92 : visualLength <= 56 ? 0.76 : 0.62);
  return clampTextUnitFontSize(Math.min(Math.max(areaFont, heightFloor), heightCap));
}

function forceReadableAutoTypesetFontSize(text: string, box: RegionBox, currentFontSize?: number) {
  const compactText = text.replace(/\s+/g, "");
  const visualLength = Math.max(1, compactText.length + (text.length - compactText.length) * 0.35);
  const targetByHeight = box.height * (
    visualLength <= 16 ? 0.78 :
    visualLength <= 32 ? 0.64 :
    visualLength <= 56 ? 0.52 :
    0.42
  );
  const currentBoost = currentFontSize ? currentFontSize * TYPESET_FORCE_SCALE : 0;
  return clampTextUnitFontSize(Math.max(
    estimateVisualAutoTypesetFontSize(text, box),
    targetByHeight,
    currentBoost,
  ));
}

function measureAutoTypesetFontSize(
  measureElement: HTMLDivElement | null,
  text: string,
  box: RegionBox,
  currentFontSize?: number,
) {
  void measureElement;
  const fitSize = measureAutoTypesetFontSizeWithCanvas(text, box);
  if (fitSize != null) return fitSize;
  return forceReadableAutoTypesetFontSize(text, box, currentFontSize);
}

function clampBrushSize(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_BRUSH_SIZE;
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(value)));
}

function clampCleanStrength(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CLEAN_STRENGTH;
  return Math.max(MIN_CLEAN_STRENGTH, Math.min(MAX_CLEAN_STRENGTH, Math.round(value)));
}

function cleanSettingsFromStrength(strengthValue: number) {
  const strength = clampCleanStrength(strengthValue);
  return {
    feather: Math.max(0, Math.min(MAX_CLEAN_FEATHER, Math.round(strength / 2))),
    maskExpansion: Math.max(0, Math.min(MAX_CLEAN_MASK_EXPANSION, strength)),
  };
}

function clampPageWorkers(value: number) {
  if (!Number.isFinite(value)) return 4;
  return Math.max(MIN_PAGE_WORKERS, Math.min(MAX_PAGE_WORKERS, Math.round(value)));
}

function pointsToSvgPath(points: PageEditPoint[]) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(" ");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function normalizeHexColor(value: string | undefined, fallback = TYPESET_DARK_TEXT_COLOR) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function relativeLuminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function textColorForBackgroundLuminance(luminance: number) {
  return luminance < TYPESET_BACKGROUND_DARK_LUMINANCE ? TYPESET_LIGHT_TEXT_COLOR : TYPESET_DARK_TEXT_COLOR;
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded for color sampling"));
    image.src = src;
  });
}

function waitForImageElement(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Rendered image could not be loaded for color sampling"));
    };
    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

function sampleColorFromCanvasImage(
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  if (width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Image dimensions are unavailable for color sampling");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth));
  canvas.height = Math.max(1, Math.round(sourceHeight));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable for color sampling");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round((x / width) * (canvas.width - 1))));
  const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round((y / height) * (canvas.height - 1))));
  const [red, green, blue] = context.getImageData(pixelX, pixelY, 1, 1).data;
  return rgbToHex(red, green, blue);
}

async function sampleColorFromRenderedImage(
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  await waitForImageElement(image);
  return sampleColorFromCanvasImage(image, x, y, width, height, image.naturalWidth, image.naturalHeight);
}

async function sampleColorFromImageUrl(imageUrl: string, x: number, y: number, width: number, height: number) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Image could not be fetched for color sampling");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return sampleColorFromCanvasImage(image, x, y, width, height, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createTypesetBackgroundCanvas(page: Page, marks: PageEditMark[]) {
  if (!page.imageUrl || !isRenderableImageUrl(page.imageUrl)) return null;
  const image = await loadImageElement(page.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(page.width));
  canvas.height = Math.max(1, Math.round(page.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const mark of marks) {
    if (mark.kind === "clean_patch" && mark.region && mark.patchUrl) {
      try {
        const patchImage = await loadImageElement(mark.patchUrl);
        context.globalAlpha = Math.max(0, Math.min(1, mark.opacity ?? 1));
        context.drawImage(
          patchImage,
          mark.region.x,
          mark.region.y,
          mark.region.width,
          mark.region.height,
        );
        context.globalAlpha = 1;
      } catch {
        context.globalAlpha = 1;
      }
      continue;
    }

    const points = mark.points ?? [];
    if (points.length >= 2) {
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, mark.opacity ?? 1));
      context.strokeStyle = normalizeHexColor(mark.color, DEFAULT_BRUSH_COLOR);
      context.lineWidth = Math.max(1, mark.size ?? DEFAULT_BRUSH_SIZE);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
      context.restore();
    }
  }

  return canvas;
}

function chooseTypesetTextColor(canvas: HTMLCanvasElement | null, box: RegionBox, fallback = TYPESET_DARK_TEXT_COLOR) {
  if (!canvas) return fallback;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;

  const insetX = Math.min(Math.max(2, box.width * 0.12), Math.max(2, box.width / 3));
  const insetY = Math.min(Math.max(2, box.height * 0.12), Math.max(2, box.height / 3));
  const left = Math.max(0, Math.min(canvas.width - 1, Math.round(box.x + insetX)));
  const top = Math.max(0, Math.min(canvas.height - 1, Math.round(box.y + insetY)));
  const right = Math.max(left + 1, Math.min(canvas.width, Math.round(box.x + box.width - insetX)));
  const bottom = Math.max(top + 1, Math.min(canvas.height, Math.round(box.y + box.height - insetY)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return fallback;

  const imageData = context.getImageData(left, top, width, height).data;
  const luminanceSamples: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 96)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      const alpha = imageData[index + 3];
      if (alpha < 16) continue;
      luminanceSamples.push(relativeLuminance(imageData[index], imageData[index + 1], imageData[index + 2]));
    }
  }

  if (luminanceSamples.length === 0) return fallback;
  luminanceSamples.sort((first, second) => first - second);
  const median = luminanceSamples[Math.floor(luminanceSamples.length / 2)];
  return textColorForBackgroundLuminance(median);
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
          </div>
          <div style={{ padding: '0 0 16px 0' }}>
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
      <header className="library-header">
        {stats ? (
          <div className="library-header-stats">
            <div className="header-stat-group">
              <span className="header-stat-label"><BookOpen size={13} /> Last worked chapter</span>
              <strong className="header-stat-value" title={stats.lastWorkedChapter}>{stats.lastWorkedChapter}</strong>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-group">
              <span className="header-stat-label"><Save size={13} /> Last modified</span>
              <strong className="header-stat-value">{formatDate(stats.lastModifiedAt)}</strong>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-group">
              <span className="header-stat-label"><LibraryIcon size={13} /> Projects</span>
              <strong className="header-stat-value">{stats.activeProjects}</strong>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-group">
              <span className="header-stat-label" style={{ color: "#4caf50" }}><CheckCircle2 size={13} /> Completed</span>
              <strong className="header-stat-value">{stats.completedChapters}</strong>
            </div>
          </div>
        ) : <div />}
        
        <div className="header-actions">
          <button className="floirs-button">
            <Filter size={16} />
            Filter
          </button>
          <button className="floirs-button" onClick={() => setIsCreateProjectOpen(true)}>
            <Plus size={16} />
            New project
          </button>
        </div>
      </header>

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
            <h2>New project</h2>
          </div>
          <button className="floirs-button floirs-button--icon" onClick={onClose} type="button" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="editor-grid create-project-grid">
          <label className="form-field">
            <span>Project name</span>
            <input
              dir="auto"
              autoFocus
              required
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Original title</span>
            <input
              dir="auto"
              value={form.originalTitle}
              onChange={(event) => onChange({ ...form, originalTitle: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Arabic title</span>
            <input
              dir="auto"
              value={form.arabicTitle}
              onChange={(event) => onChange({ ...form, arabicTitle: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Source language</span>
            <input
              dir="auto"
              value={form.sourceLanguage}
              onChange={(event) => onChange({ ...form, sourceLanguage: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Target language</span>
            <input
              dir="auto"
              value={form.targetLanguage}
              onChange={(event) => onChange({ ...form, targetLanguage: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Genres</span>
            <input
              dir="auto"
              placeholder="Action, Fantasy"
              value={form.genres}
              onChange={(event) => onChange({ ...form, genres: event.target.value })}
            />
          </label>
          <label className="form-field full">
            <span>Description</span>
            <textarea
              dir="auto"
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
              onInput={(event) => {
                const target = event.currentTarget;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
          </label>
          <label className="form-field full">
            <span>Work context</span>
            <textarea
              dir="auto"
              value={form.contextSummary}
              onChange={(event) => onChange({ ...form, contextSummary: event.target.value })}
              onInput={(event) => {
                const target = event.currentTarget;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
          </label>
        </div>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="form-actions">
          <button className="floirs-button" disabled={isSaving} type="submit">
            <Save size={16} />
            {isSaving ? "Creating" : "Create project"}
          </button>
          <button className="floirs-button" disabled={isSaving} onClick={onClose} type="button">
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
      {project.coverUrl && (
        <div 
          className="project-card-bg" 
          style={{ backgroundImage: `url(${project.coverUrl})` }} 
        />
      )}
      <ProjectCover project={project} />
      <div className="project-card-body">
        <div className="project-card-header">
          <h2>{project.title}</h2>
        </div>

        <div className="project-meta-elegant">
          <div className="meta-item">
            <span>Last ch.</span>
            <strong>{project.lastWorkedChapterLabel ?? "None"}</strong>
          </div>
          <div className="meta-item">
            <span>Last modified</span>
            <strong>{formatDate(project.lastModifiedAt)}</strong>
          </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search series"
              style={{ 
                width: '100%', 
                padding: '8px 12px 8px 36px', 
                borderRadius: '6px', 
                border: '1px solid #333', 
                backgroundColor: '#1a1a1a', 
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#333'}
            />
          </div>
          <button 
            className="button" 
            type="button" 
            title="Refresh"
            style={{ 
              height: '36px', 
              width: '36px', 
              padding: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: '#1a1a1a', 
              border: '1px solid #333', 
              color: '#ddd',
              transition: 'border-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
            onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

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

    const detailBanner = sourceResult.details.coverUrl ?? null;
    const detailReadableCount = sourceResult.chapters.filter((chapter) => chapter.availability === "readable").length;

    return (
      <div className="page" style={{ padding: 0 }}>
        <section className="series-detail">
          <div
            className="series-detail__banner"
            style={
              detailBanner
                ? {
                    position: 'fixed',
                    top: '-50px',
                    left: '-50px',
                    right: '-50px',
                    bottom: '-50px',
                    backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.85)), url(${detailBanner})`,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                    filter: 'blur(30px)',
                    opacity: 0.4,
                    zIndex: 0,
                    pointerEvents: 'none'
                  }
                : { display: 'none' }
            }
          />
          <div className="series-detail__hero" style={{ background: 'transparent' }}>
            <div className="series-detail__backbar">
              <button
                type="button"
                className="floirs-button"
                title="Back"
                onClick={() => navigate("/explorer")}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            </div>
  
        </div>

        <div className="series-detail__header">
          <div className="series-detail__cover-panel">
            {sourceResult.details.coverUrl ? (
              <img className="series-detail__cover" src={sourceResult.details.coverUrl} alt={sourceResult.details.name} />
            ) : (
              <div className="series-detail__cover series-detail__cover--empty">No cover</div>
            )}
          </div>

          <div className="series-detail__title-block">
            <div className="series-detail__title-row">
              <h1 className="series-detail__title">{sourceResult.details.name}</h1>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              {sourceResult.details.tags.length ? (
                <div className="series-detail__tags" style={{ margin: 0, flex: 1 }}>
                  {sourceResult.details.tags.map((tag) => (
                    <span className="series-detail__tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : <div style={{ flex: 1 }} />}
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <a
                href={sourceResult.details.canonicalUrl}
                target="_blank"
                rel="noreferrer"
                className="floirs-button floirs-button--icon"
                title="Open source page"
              >
                <Compass size={16} />
              </a>
              <button
                type="button"
                className="floirs-button"
                onClick={() => addSourceProjectMutation.mutate()}
                disabled={addSourceProjectMutation.isPending}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem' }}
              >
                {addSourceProjectMutation.isPending ? "Adding..." : "Add to Library"}
              </button>
            </div>
            <div className="series-detail__meta-cards">
              <div className="series-detail__meta-card">
                <span className="series-detail__meta-label">Source</span>
                <strong>{sourceResult.details.sourceLabel ?? sourceId}</strong>
              </div>
              <div className="series-detail__meta-card">
                <span className="series-detail__meta-label">Status</span>
                <strong>{sourceResult.details.statusLabel ?? sourceResult.details.status}</strong>
              </div>
              <div className="series-detail__meta-card">
                <span className="series-detail__meta-label">Original Language</span>
                <strong>{sourceResult.details.originalLanguage ?? "Unknown"}</strong>
              </div>
            </div>

            <div className="series-detail__summary-box">
              <p className="series-detail__summary" dir="rtl">
                {sourceResult.details.description || "لا يوجد وصف."}
              </p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1152px', width: '100%', margin: '0 auto', padding: '0 2rem', position: 'relative', zIndex: 10 }}>
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

          <div className="series-detail__table-wrap">
            <div className="series-detail__table">
              <div className="series-detail__table-head">
                <span>TITLE</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', textTransform: 'none', letterSpacing: 'normal' }}>
                </div>
              </div>

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
        </div>
      </section>
      </div>
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
            <button className="floirs-button">
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

function formatReleaseDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const now = new Date();
  const diffTime = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
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
      className="series-detail__table-row"
      onClick={() => {
        if (isReadable) onRead();
      }}
    >
      <div className="series-detail__cell series-detail__cell--title" title={chapter.title || "Untitled"}>
        <span className="series-detail__title-text">
          {chapter.chapterNumber == null ? "Chapter" : `Chapter ${chapter.chapterNumber}`} - {chapter.title || "Untitled"}
        </span>
        {chapter.availability !== "readable" && (
          <span className={`series-detail__chapter-badge series-detail__chapter-badge--${chapter.availability}`}>
            {chapter.availabilityLabel ?? chapter.availability}
          </span>
        )}
      </div>
      <div className="series-detail__cell series-detail__cell--actions">
        <span className="series-detail__cell--date">{formatReleaseDate(chapter.releaseDate)}</span>
        <div className="series-detail__row-actions">
          <button
            className="floirs-button floirs-button--icon source-download-button"
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
      </div>
    </div>
  );
}

function RightSidebar({ overview, projectId }: { overview: any; projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeSortOrder, setActiveSortOrder] = useState<"asc" | "desc">("desc");
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

  const rows = chaptersQuery.data ?? [];
  const activeRows = rows.filter((ch: any) => ch.status === "In Progress").sort((a: any, b: any) => {
    const dateA = new Date(a.updatedAt || 0).getTime();
    const dateB = new Date(b.updatedAt || 0).getTime();
    return activeSortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Chapters</span>
            <strong style={{ display: 'block', color: '#fff', fontSize: '22px', marginTop: '6px' }}>{overview.chaptersCount}</strong>
          </div>
          <div>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Characters</span>
            <strong style={{ display: 'block', color: '#fff', fontSize: '22px', marginTop: '6px' }}>{overview.charactersCount}</strong>
          </div>
          <div>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>General terms</span>
            <strong style={{ display: 'block', color: '#fff', fontSize: '22px', marginTop: '6px' }}>{overview.generalTermsCount}</strong>
          </div>
          <div>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Last modified</span>
            <strong style={{ display: 'block', color: '#fff', fontSize: '15px', marginTop: '12px' }}>{formatDate(overview.lastModifiedAt)}</strong>
          </div>
        </div>
      </div>

      {activeRows.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: '#F0E6D2', fontWeight: 600 }}>Active Chapters</h3>
          <div className="series-detail__table-wrap" style={{ border: '1px solid rgba(240, 230, 210, 0.3)', boxShadow: '0 0 20px rgba(240, 230, 210, 0.05)' }}>
            <div className="series-detail__table">
              <div className="series-detail__table-head" style={{ borderBottomColor: 'rgba(240, 230, 210, 0.2)', position: 'relative' }}>
                <span>TITLE</span>
                <span style={{ textAlign: 'right' }}>LAST MODIFIED</span>
                <button
                  type="button"
                  onClick={() => setActiveSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                  title={activeSortOrder === "desc" ? "Oldest first" : "Newest first"}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F0E6D2', transition: 'color 0.2s' }}
                >
                  <ArrowUpDown size={14} />
                </button>
              </div>
              {activeRows.map((chapter: any) => (
                <ChapterRow
                  key={chapter.id}
                  chapter={chapter}
                  isPreparing={
                    prepareChapterMutation.isPending &&
                    prepareChapterMutation.variables === chapter.id
                  }
                  isSubTable={true}
                  onOpen={() => prepareChapterMutation.mutate(chapter.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
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
      <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
      <button className="inline-back" onClick={() => navigate("/library")}>
        <ArrowLeft size={16} />
        Back to Library
      </button>

      <header className="project-hero" style={{ gridTemplateColumns: '138px minmax(0, 1fr) auto', alignItems: 'stretch' }}>
        <SourceCover imageUrl={overview.coverUrl} title={overview.title} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1>{overview.title}</h1>
          <div className="tag-row" style={{ marginBottom: '16px', marginTop: '8px' }}>
            {overview.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '20px', marginTop: 'auto', maxWidth: '800px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', margin: 0, letterSpacing: '0.5px' }}>Context for AI</h2>
              <button className="edit-context-btn" title="Edit Context">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0, color: '#ccc' }}>
              {overview.contextSummary || "No work context provided."}
            </p>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '32px', alignItems: 'start' }}>
        <div className="left-column">
          <div className="page-switcher" style={{ display: 'flex', width: '100%', marginBottom: '24px' }}>
            <button 
              className={tab === "chapters" ? "active" : ""}
              onClick={() => selectTab("chapters")}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '46px', fontSize: '1rem' }}
            >
              <Layers3 size={18} color={tab === "chapters" ? '#fff' : '#888'} />
              <span>Chapters</span>
            </button>
            <button 
              className={tab === "dictionary" ? "active" : ""}
              onClick={() => selectTab("dictionary")}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '46px', fontSize: '1rem' }}
            >
              <Languages size={18} color={tab === "dictionary" ? '#fff' : '#888'} />
              <span>Dictionary</span>
            </button>
          </div>
          {tab === "chapters" ? <ChaptersTab projectId={overview.id} overview={overview} /> : null}
          {tab === "dictionary" ? <DictionaryTab projectId={overview.id} /> : null}
        </div>
        <RightSidebar overview={overview} projectId={overview.id} />
      </div>
    </div>
    </section>
  );
}

function ChaptersTab({ projectId, overview }: { projectId: string; overview: any }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateChapterOpen, setIsCreateChapterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
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
  
  const filteredRows = rows.filter(ch => 
    ch.displayLabel.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (ch.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const otherRows = [...filteredRows].sort((a, b) => {
    const labelA = a.displayLabel || "";
    const labelB = b.displayLabel || "";
    return sortOrder === "asc" ? labelA.localeCompare(labelB, undefined, { numeric: true }) : labelB.localeCompare(labelA, undefined, { numeric: true });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {prepareChapterMutation.isError ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <p className="danger text-center">
            {prepareChapterMutation.error instanceof Error
              ? prepareChapterMutation.error.message
              : "Could not download chapter"}
          </p>
        </div>
      ) : null}
        {/* Main Table (Other Chapters) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', fontWeight: 600 }}>All Chapters</h3>
              <span style={{ fontSize: '0.85rem', color: '#888', position: 'relative', top: '2px' }}>{filteredRows.length} chapters</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ position: 'relative', width: '240px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                <input 
                  type="text" 
                  placeholder="Search chapters..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px 12px 8px 36px', 
                    borderRadius: '6px', 
                    border: '1px solid #333', 
                    backgroundColor: '#1a1a1a', 
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }} 
                />
              </div>
              <button
                className="button"
                type="button"
                style={{ 
                  height: '36px', 
                  minHeight: '36px', 
                  padding: '0 16px', 
                  fontSize: '0.85rem',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#ddd',
                  transition: 'border-color 0.2s'
                }} 
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}
                onClick={() => setIsCreateChapterOpen(true)}
              >
                <Plus size={16} />
                Add chapter
              </button>
            </div>
          </div>
          <div className="series-detail__table-wrap">
            <div className="series-detail__table project-chapters-table">
              <div className="series-detail__table-head" style={{ position: 'relative' }}>
                <span>TITLE</span>
                <span style={{ textAlign: 'center' }}>STATUS</span>
                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                  title={sortOrder === "desc" ? "Sort A-Z" : "Sort Z-A"}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F0E6D2', transition: 'color 0.2s' }}
                >
                  <ArrowUpDown size={14} />
                </button>
              </div>
              {otherRows.map((chapter) => (
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
              {otherRows.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>No other chapters</div>
              )}
            </div>
          </div>
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
        <div className="modal-head" style={{ marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Add chapter</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Close" style={{ background: 'transparent', border: 'none', color: '#888' }}>
            <X size={20} />
          </button>
        </div>

        <div className="dictionary-editor" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px', marginBottom: '24px' }}>
          <label className="form-field">
            <span style={{ marginBottom: '4px', color: '#888' }}>Chapter number</span>
            <input
              autoFocus
              required
              value={form.number}
              onChange={(event) => onChange({ ...form, number: event.target.value })}
              placeholder="1"
            />
          </label>
          <label className="form-field">
            <span style={{ marginBottom: '4px', color: '#888' }}>Title</span>
            <input
              value={form.title}
              onChange={(event) => onChange({ ...form, title: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <div className="form-field full" style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
            <span style={{ marginBottom: '8px', color: '#888' }}>Page images</span>
            <div className="chapter-image-picker" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button 
                className="button" 
                type="button" 
                style={{ height: '36px', backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#ddd' }}
                onClick={onChooseImages}
              >
                <ImageIcon size={15} />
                Choose images
              </button>
              <strong style={{ color: '#888', fontWeight: 500 }}>{form.imagePaths.length} selected</strong>
            </div>
            {form.imagePaths.length > 0 ? (
              <div className="selected-file-list" style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid #222' }}>
                {selectedPreview.map((imagePath) => (
                  <span key={imagePath} style={{ display: 'inline-block', marginRight: '12px', color: '#aaa', fontSize: '0.85rem' }}>{fileNameFromPath(imagePath)}</span>
                ))}
                {remainingCount > 0 ? <span style={{ color: '#fff' }}>+{remainingCount} more</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        {imagePickerError ? <p className="error-line">{imagePickerError}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}

        <div className="form-actions end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button 
            className="button" 
            type="button" 
            onClick={onClose} 
            disabled={isSaving}
            style={{ background: 'transparent', border: '1px solid transparent', color: '#888' }}
          >
            Cancel
          </button>
          <button className="floirs-button" type="submit" disabled={!canSubmit} style={{ padding: '0 20px' }}>
            {isSaving ? "Creating..." : "Create chapter"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChapterRow({
  chapter,
  isPreparing,
  isSubTable,
  extraColumn,
  onOpen,
}: {
  chapter: Chapter;
  isPreparing: boolean;
  isSubTable?: boolean;
  extraColumn?: boolean;
  onOpen: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="series-detail__table-row"
      onClick={isPreparing ? undefined : onOpen}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={isPreparing ? { opacity: 0.5, pointerEvents: 'none' } : { cursor: 'pointer', position: 'relative', paddingRight: isSubTable ? '40px' : undefined }}
    >
      <div className="series-detail__cell series-detail__cell--title" title={chapter.title || "Untitled"}>
        <span className="series-detail__title-text">
          {chapter.displayLabel} - {chapter.title || "Untitled"}
        </span>
      </div>
      {!isSubTable && (
        <div className="series-detail__cell" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'center', flexWrap: 'nowrap' }}>
          <span className={`status-chip ${statusClass(chapter.status)}`}>{chapter.status}</span>
          {(isPreparing || chapter.downloadStatus !== "Downloaded") && (
            <span
              className={`status-chip ${statusClass(isPreparing ? "Downloading" : chapter.downloadStatus)}`}
              title={chapter.downloadError ?? chapter.downloadStatus}
            >
              {isPreparing ? "Downloading" : chapter.downloadStatus}
            </span>
          )}
        </div>
      )}
      {isSubTable && (
        <div className="series-detail__cell" style={{ textAlign: 'right', color: '#888', fontSize: '0.85rem' }}>
          {formatDate(chapter.updatedAt as any)}
        </div>
      )}

      {isSubTable && isHovered && (
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, cursor: 'pointer', display: 'flex' }}
        >
          <X size={16} />
        </div>
      )}

      {!isSubTable && (
        <div style={{ 
          position: 'absolute', 
          right: '24px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          opacity: isHovered ? 1 : 0.3, 
          transition: 'all 0.2s ease', 
          color: isHovered ? '#fff' : '#888',
          border: isHovered ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid #333',
          backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
          borderRadius: '8px',
          width: '32px',
          height: '32px',
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center', 
          pointerEvents: 'none' 
        }}>
          <Eye size={15} />
        </div>
      )}
    </div>
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
      <div className="table-card" style={{ padding: '24px' }}>
        
        {/* Unified Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          
          <div className="page-switcher" style={{ margin: 0 }}>
            <button className={section === "characters" ? "active" : ""} onClick={() => selectSection("characters")}>
              Characters
            </button>
            <button className={section === "glossary" ? "active" : ""} onClick={() => selectSection("glossary")}>
              General Glossary
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
              <input 
                type="text" 
                placeholder={section === "characters" ? "Search characters..." : "Search terms..."} 
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px 8px 36px', 
                  borderRadius: '6px', 
                  border: '1px solid #333', 
                  backgroundColor: '#1a1a1a', 
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  height: '36px'
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)'}
                onBlur={(e) => e.target.style.borderColor = '#333'}
              />
            </div>

            {section === "characters" ? (
              <select
                className="field-select"
                style={{ height: '36px', width: 'auto', minWidth: '120px', fontSize: '0.85rem' }}
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
                style={{ height: '36px', width: 'auto', minWidth: '120px', fontSize: '0.85rem' }}
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="All">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            )}

            <button 
              className="button" 
              style={{ 
                height: '36px', 
                minHeight: '36px', 
                padding: '0 16px', 
                fontSize: '0.85rem',
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                color: '#ddd',
                transition: 'border-color 0.2s'
              }} 
              onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}
              onClick={section === "characters" ? openAddCharacter : openAddTerm}
            >
              <Plus size={15} />
              {section === "characters" ? "Add character" : "Add term"}
            </button>
          </div>
        </div>

      {section === "characters" ? (
        <>
          {characterForm ? (
            <form className="dictionary-editor" onSubmit={submitCharacter}>
              <div className="editor-grid">
                <label className="form-field">
                  <span>English Name</span>
                  <input
                    required
                    autoFocus
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
                    className="floirs-button"
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
                      className="floirs-button floirs-button--icon danger"
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
                <button className="floirs-button" disabled={isCharacterSaving} type="submit">
                  <Save size={16} />
                  {editingCharacterId ? "Save character" : "Create character"}
                </button>
                <button
                  className="floirs-button"
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
                <div><span className="category-tag">{character.gender}</span></div>
                <span>
                  {character.aliases.map((alias) => `${alias.english} / ${alias.arabic}`).join(", ") || "None"}
                </span>
                <span>{character.description ?? "No description"}</span>
                <div className="row-actions">
                  <button className="floirs-button floirs-button--icon" title="Edit character" onClick={() => openEditCharacter(character)}>
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="floirs-button floirs-button--icon danger"
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
            {filteredCharacters.length === 0 ? (
              <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                No characters found.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {termForm ? (
            <form className="dictionary-editor" onSubmit={submitTerm}>
              <div className="editor-grid">
                <label className="form-field">
                  <span>English Term</span>
                  <input
                    required
                    autoFocus
                    value={termForm.englishTerm}
                    onChange={(event) => setTermForm({ ...termForm, englishTerm: event.target.value })}
                  />
                </label>
                <label className="form-field">
                  <span>Arabic Term</span>
                  <input
                    required
                    dir="rtl"
                    value={termForm.arabicTerm}
                    onChange={(event) => setTermForm({ ...termForm, arabicTerm: event.target.value })}
                  />
                </label>
                <label className="form-field">
                  <span>Category</span>
                  <select
                    value={termForm.category}
                    onChange={(event) => setTermForm({ ...termForm, category: event.target.value })}
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field full">
                  <span>Description</span>
                  <textarea
                    value={termForm.description}
                    onChange={(event) => setTermForm({ ...termForm, description: event.target.value })}
                  />
                </label>
              </div>
              {termMutationError ? <p className="error-line">{(termMutationError as Error).message}</p> : null}
              <div className="form-actions">
                <button className="floirs-button" disabled={isTermSaving} type="submit">
                  <Save size={16} />
                  {editingTermId ? "Save term" : "Create term"}
                </button>
                <button
                  className="floirs-button"
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
                <div><span className="category-tag">{term.category}</span></div>
                <span>{term.description ?? "No description"}</span>
                <div className="row-actions">
                  <button className="floirs-button floirs-button--icon" title="Edit term" onClick={() => openEditTerm(term)}>
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="floirs-button floirs-button--icon danger"
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
            {filteredTerms.length === 0 ? (
              <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
                No terms found.
              </p>
            ) : null}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function TranslationPage() {
  const { projectId, chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editPageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const originalPaneScrollRef = useRef<HTMLDivElement | null>(null);
  const editPaneScrollRef = useRef<HTMLDivElement | null>(null);
  const splitStageRef = useRef<HTMLDivElement | null>(null);
  const textBoxDragRef = useRef<TextBoxDragState | null>(null);
  const drawStrokeRef = useRef<DrawStrokeState | null>(null);
  const scrollSyncRef = useRef<"edit" | "original" | null>(null);
  const translationScreenRef = useRef<HTMLElement | null>(null);
  const ocrSelectionRef = useRef<OcrSelectionState | null>(null);
  const cleanSelectionRef = useRef<OcrSelectionState | null>(null);
  const restoreAreaSelectionRef = useRef<OcrSelectionState | null>(null);
  const autoTypesetMeasureRef = useRef<HTMLDivElement | null>(null);
  const typesetBackgroundCacheRef = useRef<Map<string, { key: string; promise: Promise<HTMLCanvasElement | null> }>>(new Map());
  const [viewerMode, setViewerMode] = useState<"page" | "webtoon">("page");
  const [mergePages, setMergePages] = useState(false);
  const [originalPanePercent, setOriginalPanePercent] = useState(44);
  const [ocrProviderId, setOcrProviderId] = useState<OcrProviderId>("windows");
  const [ocrLanguageHint, setOcrLanguageHint] = useState("english");
  const [ocrPageWorkers, setOcrPageWorkers] = useState(4);
  const [replaceOcrText, setReplaceOcrText] = useState(true);
  const [autoCleanOcrText, setAutoCleanOcrText] = useState(false);
  const [autoCleanPolicy, setAutoCleanPolicy] = useState<CleanPolicy>("safe_bubbles_only");
  const [autoCleanProvider, setAutoCleanProvider] = useState<CleanProviderId>("bubble_fill");
  const [autoCleanMaskExpansion, setAutoCleanMaskExpansion] = useState(6);
  const [ocrSelection, setOcrSelection] = useState<OcrSelectionState | null>(null);
  const [cleanSelection, setCleanSelection] = useState<OcrSelectionState | null>(null);
  const [restoreAreaSelection, setRestoreAreaSelection] = useState<OcrSelectionState | null>(null);
  const [textBoxDraft, setTextBoxDraft] = useState<TextBoxDraftState | null>(null);
  const [drawStroke, setDrawStroke] = useState<DrawStrokeState | null>(null);
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [cleanStrength, setCleanStrength] = useState(DEFAULT_CLEAN_STRENGTH);
  const [cleanMethod, setCleanMethod] = useState<"telea" | "ns">("telea");
  const [cleanProvider, setCleanProvider] = useState<CleanProviderId>("bubble_fill");
  const [aiScope, setAiScope] = useState<"selected" | "page" | "chapter">("page");
  const [aiTranslationLevel, setAiTranslationLevel] = useState<TranslationLevel>(3);
  const [microsoftScope, setMicrosoftScope] = useState<"page" | "chapter">("page");
  const [ocrStatus, setOcrStatus] = useState("");
  const [cleanStatus, setCleanStatus] = useState("");
  const [colorPickStatus, setColorPickStatus] = useState("");
  const [autoTypesetStatus, setAutoTypesetStatus] = useState("");
  const [aiTranslationStatus, setAiTranslationStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [henryScope, setHenryScope] = useState<"page" | "chapter" | null>(null);
  const [henryMenuScope, setHenryMenuScope] = useState<"page" | "chapter" | null>(null);
  const [henryStatus, setHenryStatus] = useState("");
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
                  color: result.color ?? unit.typesetting.color,
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
  const addPageEditMarkMutation = useMutation({
    mutationFn: (input: PageEditMarkInput) => addPageEditMark(input),
    onSuccess: (mark) => {
      queryClient.setQueryData<ChapterTranslationWorkspace | undefined>(
        ["translation-workspace", mark.chapterId],
        (current) => current
          ? {
            ...current,
            pageEditMarks: [...(current.pageEditMarks ?? []), mark],
          }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", mark.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const deletePageEditMarkMutation = useMutation({
    mutationFn: (markId: string) => deletePageEditMark(markId),
    onSuccess: (result) => {
      queryClient.setQueryData<ChapterTranslationWorkspace | undefined>(
        ["translation-workspace", result.chapterId],
        (current) => current
          ? {
            ...current,
            pageEditMarks: (current.pageEditMarks ?? []).filter((mark) => mark.id !== result.id),
          }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const restoreCleanPatchAreaMutation = useMutation({
    mutationFn: async ({
      marks,
      region,
    }: {
      marks: PageEditMark[];
      region: RegionBox;
    }) => {
      const results: RestoreCleanPatchAreaResult[] = [];
      for (const mark of marks) {
        if (!mark.region) continue;
        results.push(await restoreCleanPatchArea(mark.id, {
          feather: 0,
          patchRegion: mark.region,
          region,
        }));
      }
      return {
        chapterId: results[0]?.chapterId ?? chapterId ?? "",
        results,
      };
    },
    onSuccess: ({ chapterId: restoredChapterId, results }) => {
      restoreAreaSelectionRef.current = null;
      setRestoreAreaSelection(null);
      const deletedCount = results.filter((result) => result.deleted).length;
      setCleanStatus(`Restored area in ${results.length} patch${results.length === 1 ? "" : "es"}${deletedCount ? `, removed ${deletedCount}` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", restoredChapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (error) => {
      restoreAreaSelectionRef.current = null;
      setRestoreAreaSelection(null);
      setCleanStatus(error instanceof Error ? error.message : "Restore area failed");
    },
  });
  const cleanPageTextMutation = useMutation({
    mutationFn: ({
      input,
      pageId,
    }: {
      input: PageCleanTextInput;
      pageId: string;
    }) => cleanPageText(pageId, input),
    onSuccess: (mark) => {
      queryClient.setQueryData<ChapterTranslationWorkspace | undefined>(
        ["translation-workspace", mark.chapterId],
        (current) => current
          ? {
            ...current,
            pageEditMarks: [...(current.pageEditMarks ?? []), mark],
          }
          : current,
      );
      setCleanSelection(null);
      cleanSelectionRef.current = null;
      setCleanStatus("Clean patch added");
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", mark.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (error) => {
      setCleanStatus(error instanceof Error ? error.message : "Smart clean failed");
    },
  });
  const runPageOcrMutation = useMutation({
    mutationFn: ({ pageId, input }: { pageId: string; input: OcrRunOptions }) =>
      runOcrForPage(pageId, input),
    onSuccess: (result) => {
      setOcrStatus(ocrResultStatus(result));
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const runRegionOcrMutation = useMutation({
    mutationFn: ({ input, pageId }: { input: OcrRegionRunOptions; pageId: string }) =>
      runOcrForRegion(pageId, input),
    onSuccess: (result) => {
      setOcrStatus(ocrResultStatus(result));
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const runChapterOcrMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OcrRunOptions }) =>
      runOcrForChapter(id, input),
    onSuccess: (result) => {
      setOcrStatus(ocrResultStatus(result));
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const microsoftTranslationMutation = useMutation({
    mutationFn: translateWithMicrosoft,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const aiTranslationMutation = useMutation({
    mutationFn: translateWithAi,
    onSuccess: (result) => {
      setAiTranslationStatus(
        result.translatedCount > 0
          ? `AI translated ${result.translatedCount} text unit${result.translatedCount === 1 ? "" : "s"}.`
          : "AI translation completed without translated text.",
      );
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (error) => {
      setAiTranslationStatus(error instanceof Error ? error.message : "AI translation failed.");
    },
  });
  const exportChapterMutation = useMutation({
    mutationFn: (id: string) => exportChapter(id),
    onSuccess: (result) => {
      setExportStatus(
        result.status === "cancelled"
          ? "Export cancelled."
          : `Exported ${result.pagesExported} page${result.pagesExported === 1 ? "" : "s"} to ${result.outputPath}`,
      );
    },
    onError: (error) => {
      setExportStatus(error instanceof Error ? error.message : "Export failed.");
    },
  });
  const deleteOcrResultsMutation = useMutation({
    mutationFn: deleteOcrResults,
    onSuccess: (result) => {
      setSelectedTextUnitId("");
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const mergeChapterPagesMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => mergeChapterPages(id, {
      direction: "vertical",
      pairSize: 2,
      replaceExisting: true,
    }),
    onSuccess: (result) => {
      setSelectedPageId("");
      setSelectedTextUnitId("");
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", result.chapterId] });
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const removeMergedPagesMutation = useMutation({
    mutationFn: removeMergedPages,
    onSuccess: (result) => {
      setSelectedPageId("");
      setSelectedTextUnitId("");
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
  const editMarksByPage = useMemo(() => {
    const groups = new Map<string, PageEditMark[]>();
    for (const mark of workspace?.pageEditMarks ?? []) {
      const group = groups.get(mark.pageId) ?? [];
      group.push(mark);
      groups.set(mark.pageId, group);
    }
    return groups;
  }, [workspace]);
  const marksByPageForWorkspace = (targetWorkspace: ChapterTranslationWorkspace) => {
    const groups = new Map<string, PageEditMark[]>();
    for (const mark of targetWorkspace.pageEditMarks ?? []) {
      const group = groups.get(mark.pageId) ?? [];
      group.push(mark);
      groups.set(mark.pageId, group);
    }
    return groups;
  };
  const getTypesetBackgroundCanvas = (page: Page, marks: PageEditMark[]) => {
    const marksKey = marks
      .map((mark) => `${mark.id}:${mark.updatedAt}:${mark.kind}:${mark.patchUrl ?? ""}:${mark.color ?? ""}:${mark.size ?? ""}:${mark.opacity ?? ""}`)
      .join("|");
    const key = `${page.imageUrl ?? ""}:${page.width}x${page.height}:${marksKey}`;
    const cached = typesetBackgroundCacheRef.current.get(page.id);
    if (cached?.key === key) return cached.promise;
    const promise = createTypesetBackgroundCanvas(page, marks).catch(() => null);
    typesetBackgroundCacheRef.current.set(page.id, { key, promise });
    return promise;
  };
  const resolveTypesetTextColor = async (page: Page, box: RegionBox, marks: PageEditMark[], fallback?: string) => {
    const canvas = await getTypesetBackgroundCanvas(page, marks);
    return chooseTypesetTextColor(canvas, box, normalizeHexColor(fallback, TYPESET_DARK_TEXT_COLOR));
  };

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

  useEffect(() => {
    if (restoreAreaSelection && !workspace?.pages.some((page) => page.id === restoreAreaSelection.pageId)) {
      restoreAreaSelectionRef.current = null;
      setRestoreAreaSelection(null);
    }
  }, [restoreAreaSelection, workspace?.pages]);

  if (workspaceQuery.isLoading) return <LoadingPanel label="Loading translation workspace" />;
  if (!workspace) return <EmptyPanel label="Chapter not found" />;
  if (workspace.pages.length === 0) return <EmptyPanel label="Chapter pages are not prepared yet" />;

  const currentPage = workspace.pages.find((page) => page.id === selectedPageId) ?? workspace.pages[0];
  const pageTextUnits = textUnitsByPage.get(currentPage.id) ?? [];
  const currentPageEditMarks = editMarksByPage.get(currentPage.id) ?? [];
  const lastCurrentPageEditMark = currentPageEditMarks[currentPageEditMarks.length - 1];
  const currentPageAutoCleanPatchCount = currentPageEditMarks.filter(isAutoCleanPatch).length;
  const explicitSelectedTextUnit = workspace.textUnits.find((unit) => unit.id === selectedTextUnitId);
  const selectedTextUnit = explicitSelectedTextUnit ?? workspace.textUnits[0];
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
  const syncPaneScroll = (sourceName: "edit" | "original") => {
    const source = sourceName === "original" ? originalPaneScrollRef.current : editPaneScrollRef.current;
    const target = sourceName === "original" ? editPaneScrollRef.current : originalPaneScrollRef.current;
    if (!source || !target) return;
    if (scrollSyncRef.current && scrollSyncRef.current !== sourceName) return;

    scrollSyncRef.current = sourceName;

    const clampScroll = (value: number, max: number) => Math.max(0, Math.min(max, value));
    const pageElements = (pane: HTMLDivElement) =>
      Array.from(pane.querySelectorAll<HTMLElement>(".mock-page[data-page-id]"));
    const paneCenter = (pane: HTMLDivElement) => {
      const rect = pane.getBoundingClientRect();
      return {
        x: rect.left + pane.clientWidth / 2,
        y: rect.top + pane.clientHeight / 2,
      };
    };
    const visiblePage = (pane: HTMLDivElement) => {
      const pages = pageElements(pane);
      if (pages.length === 0) return null;
      if (viewerMode === "page") return pages[0];

      const center = paneCenter(pane);
      let bestPage = pages[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const pageElement of pages) {
        const rect = pageElement.getBoundingClientRect();
        const containsCenter = rect.top <= center.y && rect.bottom >= center.y;
        const distance = containsCenter ? 0 : Math.abs(center.y - (rect.top + rect.height / 2));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = pageElement;
        }
      }
      return bestPage;
    };

    target.scrollTop = clampScroll(source.scrollTop, Math.max(0, target.scrollHeight - target.clientHeight));
    target.scrollLeft = clampScroll(source.scrollLeft, Math.max(0, target.scrollWidth - target.clientWidth));

    const sourcePage = visiblePage(source);
    const sourcePageId = sourcePage?.dataset.pageId;
    if (viewerMode === "webtoon" && sourcePageId && sourcePageId !== selectedPageId) {
      setSelectedPageId(sourcePageId);
    }

    window.requestAnimationFrame(() => {
      if (scrollSyncRef.current === sourceName) {
        scrollSyncRef.current = null;
      }
    });
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
  const displayFontSizeForUnit = (unit: TextUnit, box = textBoxForUnit(unit)) => {
    const overlayText = getOverlayText(unit);
    if (!overlayText || unit.typesetting.isExplicit) return clampTextUnitFontSize(unit.typesetting.fontSize);
    return measureAutoTypesetFontSize(autoTypesetMeasureRef.current, overlayText, box);
  };
  const selectedTextBox = selectedTextUnit ? textBoxForUnit(selectedTextUnit) : undefined;
  const currentPageTranslatedUnitCount = pageTextUnits.filter((unit) => getAutoTypesetText(unit)).length;
  const isHenryRunning = henryScope !== null;
  const isAutoTypesetting = updateTextUnitTypesettingMutation.isPending || isHenryRunning;
  const calculateAutoPasteTypesetting = async (
    unit: TextUnit,
    page: Page,
    marks: PageEditMark[],
    translationSource: TypesetTranslationSource = "default",
  ): Promise<TextUnitTypesettingInput | null> => {
    const text = getAutoTypesetText(unit, translationSource);
    if (!text) return null;
    const box = addAutoPasteComfortToBox(expandAutoTypesetRegion(unit, page, translationSource), page);
    return {
      box,
      color: await resolveTypesetTextColor(page, box, marks),
      fontSize: boostSingleWordAutoPasteFontSize(
        text,
        measureAutoTypesetFontSize(autoTypesetMeasureRef.current, text, box),
      ),
    };
  };
  const calculateAutoTypesetting = async (
    unit: TextUnit,
    page: Page,
    mode: "fit-current-box" | "paste-from-ocr",
    marks: PageEditMark[] = editMarksByPage.get(page.id) ?? [],
    translationSource: TypesetTranslationSource = "default",
  ): Promise<TextUnitTypesettingInput | null> => {
    const text = getAutoTypesetText(unit, translationSource);
    if (!text) return null;
    if (mode === "paste-from-ocr") return calculateAutoPasteTypesetting(unit, page, marks, translationSource);
    const box = clampTextBoxToPage(textBoxForUnit(unit), page);
    return {
      box,
      color: await resolveTypesetTextColor(page, box, marks),
      fontSize: measureAutoTypesetFontSize(autoTypesetMeasureRef.current, text, box, unit.typesetting.fontSize),
    };
  };
  const autoTypesetUnits = async (
    targetWorkspace: ChapterTranslationWorkspace,
    units: TextUnit[],
    statusPrefix = "Auto pasting",
    translationSource: TypesetTranslationSource = "default",
  ) => {
    const pagesById = new Map(targetWorkspace.pages.map((page) => [page.id, page]));
    const targetMarksByPage = marksByPageForWorkspace(targetWorkspace);
    const jobs: { input: TextUnitTypesettingInput; unit: TextUnit }[] = [];
    for (const unit of units) {
      const page = pagesById.get(unit.pageId);
      if (!page) continue;
      const input = await calculateAutoPasteTypesetting(unit, page, targetMarksByPage.get(page.id) ?? [], translationSource);
      if (input) jobs.push({ input, unit });
    }

    for (let index = 0; index < jobs.length; index += 1) {
      if (index === 0 || index % 10 === 0) {
        setAutoTypesetStatus(`${statusPrefix} ${index + 1}/${jobs.length}...`);
      }
      await updateTextUnitTypesetting(jobs[index].unit.id, jobs[index].input);
    }

    return {
      pasted: jobs.length,
      skipped: units.length - jobs.length,
    };
  };
  const autoFitSelectedText = async () => {
    if (!selectedTextUnit || isAutoTypesetting) return;
    const selectedPage = pageForTextUnit(selectedTextUnit);
    const input = await calculateAutoTypesetting(
      selectedTextUnit,
      selectedPage,
      "fit-current-box",
      editMarksByPage.get(selectedPage.id) ?? [],
    );
    if (!input) {
      setAutoTypesetStatus("No translated text on the selected OCR unit.");
      return;
    }

    setActiveTool("typeset");
    setAutoTypesetStatus("Fitting selected text...");
    try {
      const result = await updateTextUnitTypesettingMutation.mutateAsync({
        input,
        textUnitId: selectedTextUnit.id,
      });
      setAutoTypesetStatus(`Selected text fitted at ${result.fontSize}px.`);
    } catch (error) {
      setAutoTypesetStatus(error instanceof Error ? error.message : "Failed to fit selected text.");
    }
  };
  const autoPasteCurrentPage = async () => {
    if (isAutoTypesetting || pageTextUnits.length === 0) return;
    const jobs: { input: TextUnitTypesettingInput; unit: TextUnit }[] = [];
    for (const unit of pageTextUnits) {
      const page = pageForTextUnit(unit);
      const input = await calculateAutoTypesetting(unit, page, "paste-from-ocr", editMarksByPage.get(page.id) ?? []);
      if (input) jobs.push({ input, unit });
    }

    if (jobs.length === 0) {
      setAutoTypesetStatus("No translated text on this page.");
      return;
    }

    setActiveTool("typeset");
    setAutoTypesetStatus(`Auto pasting ${jobs.length} text boxes...`);
    try {
      for (const job of jobs) {
        await updateTextUnitTypesettingMutation.mutateAsync({
          input: job.input,
          textUnitId: job.unit.id,
        });
      }
      const skipped = pageTextUnits.length - jobs.length;
      const fontSizes = jobs.map((job) => job.input.fontSize ?? 0).filter((fontSize) => fontSize > 0);
      const fontRange = fontSizes.length > 0
        ? ` Sizes ${Math.min(...fontSizes)}-${Math.max(...fontSizes)}px.`
        : "";
      setAutoTypesetStatus(
        skipped > 0
          ? `Auto pasted ${jobs.length}. Skipped ${skipped} without translation.${fontRange}`
          : `Auto pasted ${jobs.length} text boxes.${fontRange}`,
      );
    } catch (error) {
      setAutoTypesetStatus(error instanceof Error ? error.message : "Auto paste failed.");
    }
  };
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
    const unit = workspace.textUnits.find((item) => item.id === textUnitId);
    updateTextUnitTypesettingMutation.mutate({
      input: {
        box,
        ...(unit && !unit.typesetting.isExplicit ? { fontSize: displayFontSizeForUnit(unit, box) } : {}),
      },
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
      didMove: false,
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
      const clientDeltaX = moveEvent.clientX - currentDragState.startClientX;
      const clientDeltaY = moveEvent.clientY - currentDragState.startClientY;
      const clientDistance = Math.hypot(clientDeltaX, clientDeltaY);
      if (!currentDragState.didMove && clientDistance < TEXT_BOX_DRAG_THRESHOLD_PX) return;
      currentDragState.didMove = true;
      const deltaX = clientDeltaX / currentDragState.zoom;
      const deltaY = clientDeltaY / currentDragState.zoom;
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
      if (!currentDragState.didMove) {
        setTextBoxDraft((draft) =>
          draft?.textUnitId === currentDragState.textUnitId ? null : draft,
        );
        return;
      }
      commitTextBoxTransform(currentDragState.textUnitId, currentDragState.currentBox);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp, { once: true });
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
  const pointFromElement = (event: PointerEvent<Element>, page: Page) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * page.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * page.height;
    return {
      x: Math.max(0, Math.min(page.width, x)),
      y: Math.max(0, Math.min(page.height, y)),
    };
  };
  const pickColorFromPage = async (event: PointerEvent<Element>, page: Page) => {
    if (activeTool !== "color-picker") return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromElement(event, page);
    if (!page.imageUrl || !isRenderableImageUrl(page.imageUrl)) {
      setColorPickStatus("No image color");
      return;
    }

    setColorPickStatus("Picking...");
    try {
      const sampled = await samplePageColor(page.id, { x: point.x, y: point.y });
      const color = sampled.color;
      setBrushColor(color);
      setColorPickStatus(`${color} (${sampled.engine})`);
      setActiveTool("draw");
    } catch (error) {
      try {
        const pageSurface = event.currentTarget.closest(".mock-page");
        const renderedImage = pageSurface?.querySelector<HTMLImageElement>(".page-image");
        const color = renderedImage
          ? await sampleColorFromRenderedImage(renderedImage, point.x, point.y, page.width, page.height).catch(() =>
              sampleColorFromImageUrl(page.imageUrl ?? "", point.x, point.y, page.width, page.height),
            )
          : await sampleColorFromImageUrl(page.imageUrl, point.x, point.y, page.width, page.height);
        setBrushColor(color);
        setColorPickStatus(`${color} (browser fallback)`);
        setActiveTool("draw");
      } catch {
        setColorPickStatus(error instanceof Error ? error.message : "Color pick failed");
      }
    }
  };
  const appendDrawPoint = (point: PageEditPoint) => {
    const current = drawStrokeRef.current;
    if (!current) return;
    const previous = current.points[current.points.length - 1];
    if (previous) {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (distance < 1.4) return;
    }
    const nextStroke = {
      ...current,
      points: [...current.points, point],
    };
    drawStrokeRef.current = nextStroke;
    setDrawStroke(nextStroke);
  };
  const beginDrawing = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool === "color-picker") {
      void pickColorFromPage(event, page);
      return;
    }
    if (activeTool === "clean") {
      beginCleanSelection(event, page);
      return;
    }
    if (activeTool === "restore-area") {
      beginRestoreAreaSelection(event, page);
      return;
    }
    if (activeTool !== "draw" || event.button !== 0 || addPageEditMarkMutation.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPageId(page.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromSvg(event, page);
    const stroke = {
      pageId: page.id,
      points: [point],
    };
    drawStrokeRef.current = stroke;
    setDrawStroke(stroke);
  };
  const moveDrawing = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool === "clean") {
      moveCleanSelection(event, page);
      return;
    }
    if (activeTool === "restore-area") {
      moveRestoreAreaSelection(event, page);
      return;
    }
    const current = drawStrokeRef.current;
    if (activeTool !== "draw" || !current || current.pageId !== page.id) return;
    event.preventDefault();
    appendDrawPoint(pointFromSvg(event, page));
  };
  const endDrawing = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool === "clean") {
      endCleanSelection(event, page);
      return;
    }
    if (activeTool === "restore-area") {
      endRestoreAreaSelection(event, page);
      return;
    }
    const current = drawStrokeRef.current;
    if (activeTool !== "draw" || !current || current.pageId !== page.id) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    appendDrawPoint(pointFromSvg(event, page));
    const finalStroke = drawStrokeRef.current;
    drawStrokeRef.current = null;
    setDrawStroke(null);
    if (!finalStroke || finalStroke.points.length < 2) return;
    addPageEditMarkMutation.mutate({
      color: brushColor,
      opacity: 1,
      pageId: finalStroke.pageId,
      points: finalStroke.points,
      size: brushSize,
    });
  };
  const undoCurrentPageStroke = () => {
    if (!lastCurrentPageEditMark || deletePageEditMarkMutation.isPending) return;
    deletePageEditMarkMutation.mutate(lastCurrentPageEditMark.id);
  };
  const restoreAutoCleanPatch = (event: PointerEvent<SVGRectElement>, mark: PageEditMark) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeTool !== "restore-clean" || deletePageEditMarkMutation.isPending || !isAutoCleanPatch(mark)) return;
    deletePageEditMarkMutation.mutate(mark.id);
  };
  const runRestoreAreaSelection = (selection: OcrSelectionState) => {
    const region = normalizeSelectionRegion(selection);
    if (!region || restoreCleanPatchAreaMutation.isPending) return;
    const pageMarks = editMarksByPage.get(selection.pageId) ?? [];
    const targets = pageMarks.filter((mark) =>
      isAutoCleanPatch(mark) && Boolean(intersectRegionBoxes(region, mark.region)),
    );
    if (targets.length === 0) {
      restoreAreaSelectionRef.current = null;
      setRestoreAreaSelection(null);
      setCleanStatus("No auto-clean patch in selected area");
      return;
    }
    setCleanStatus("Restoring selected area...");
    restoreCleanPatchAreaMutation.mutate({ marks: targets, region });
  };
  const runCleanSelection = (selection: OcrSelectionState) => {
    const region = normalizeSelectionRegion(selection);
    if (!region || cleanPageTextMutation.isPending) return;
    setCleanStatus("Cleaning...");
    const cleanSettings = cleanSettingsFromStrength(cleanStrength);
    cleanPageTextMutation.mutate({
      input: {
        feather: cleanSettings.feather,
        maskExpansion: cleanSettings.maskExpansion,
        method: cleanMethod,
        mode: "manual_selection",
        policy: "force_all_regions",
        provider: cleanProvider,
        region,
        source: "manual_clean",
      },
      pageId: selection.pageId,
    });
  };
  const ocrInput: OcrRunOptions = {
    autoCleanFeather: 2,
    autoCleanMaskExpansion,
    autoCleanPolicy: autoCleanProvider === "algorithm" ? "force_all_regions" : autoCleanPolicy,
    autoCleanProvider,
    autoCleanText: autoCleanOcrText,
    languageHint: ocrLanguageHint || undefined,
    parallelPageWorkers: ocrPageWorkers,
    providerId: ocrProviderId,
    replaceExisting: replaceOcrText,
  };
  const selectedOcrRegion = normalizeSelectionRegion(ocrSelection);
  const selectedCleanRegion = normalizeSelectionRegion(cleanSelection);
  const selectedRestoreAreaRegion = normalizeSelectionRegion(restoreAreaSelection);
  const selectedProvider = ocrProvidersQuery.data?.find((provider) => provider.id === ocrProviderId);
  const isOcrRunning =
    isHenryRunning || runPageOcrMutation.isPending || runRegionOcrMutation.isPending || runChapterOcrMutation.isPending;
  const isHenryBlocked =
    isOcrRunning ||
    microsoftTranslationMutation.isPending ||
    aiTranslationMutation.isPending ||
    !selectedProvider?.available;
  const ocrError =
    runPageOcrMutation.error instanceof Error
      ? runPageOcrMutation.error.message
      : runRegionOcrMutation.error instanceof Error
        ? runRegionOcrMutation.error.message
        : runChapterOcrMutation.error instanceof Error
          ? runChapterOcrMutation.error.message
          : null;
  const henryOcrInput: OcrRunOptions = {
    ...ocrInput,
    autoCleanFeather: 2,
    autoCleanMaskExpansion: Math.max(autoCleanMaskExpansion, HENRY_AUTO_CLEAN_MASK_EXPANSION),
    autoCleanPolicy: "force_all_regions",
    autoCleanProvider: "algorithm",
    autoCleanText: true,
    replaceExisting: true,
  };
  const runCurrentPageOcr = () => {
    if (!currentPage || isOcrRunning) return;
    setOcrStatus(autoCleanOcrText ? "Running OCR with auto-clean..." : "Running OCR...");
    runPageOcrMutation.mutate({ input: ocrInput, pageId: currentPage.id });
  };
  const runOcrSelection = (selection: OcrSelectionState) => {
    const region = normalizeSelectionRegion(selection);
    if (!region || isOcrRunning || !selectedProvider?.available) return;
    setOcrStatus(autoCleanOcrText ? "Running selected OCR with auto-clean..." : "Running selected OCR...");
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
    setOcrStatus(
      autoCleanOcrText
        ? `Running chapter OCR with auto-clean using ${ocrPageWorkers} workers...`
        : `Running chapter OCR using ${ocrPageWorkers} workers...`,
    );
    runChapterOcrMutation.mutate({ id: chapterId, input: ocrInput });
  };
  const runMicrosoftTranslation = () => {
    if (!chapterId || microsoftTranslationMutation.isPending) return;
    if (explicitSelectedTextUnit) {
      microsoftTranslationMutation.mutate({
        chapterId,
        scope: "text_unit",
        textUnitId: explicitSelectedTextUnit.id,
      });
      return;
    }
    if (microsoftScope === "page" && currentPage) {
      microsoftTranslationMutation.mutate({
        chapterId,
        pageId: currentPage.id,
        scope: "page",
      });
      return;
    }
    microsoftTranslationMutation.mutate({
      chapterId,
      scope: "chapter",
    });
  };
  const runAiTranslation = () => {
    if (!chapterId || aiTranslationMutation.isPending) return;
    setAiTranslationStatus("");
    if (aiScope === "selected") {
      if (!explicitSelectedTextUnit) {
        setAiTranslationStatus("No selected OCR text unit.");
        return;
      }
      aiTranslationMutation.mutate({
        chapterId,
        mode: "draft",
        provider: "ai",
        scope: "text_unit",
        textUnitId: explicitSelectedTextUnit.id,
        translationLevel: aiTranslationLevel,
      });
      return;
    }
    if (aiScope === "page" && currentPage) {
      aiTranslationMutation.mutate({
        chapterId,
        mode: "draft",
        pageId: currentPage.id,
        provider: "ai",
        scope: "page",
        translationLevel: aiTranslationLevel,
      });
      return;
    }
    aiTranslationMutation.mutate({
      chapterId,
      mode: "draft",
      provider: "ai",
      scope: "chapter",
      translationLevel: aiTranslationLevel,
    });
  };
  const runHenryPipeline = async (scope: "page" | "chapter", translationProvider: HenryTranslationProvider) => {
    if (
      !chapterId ||
      isHenryRunning ||
      isOcrRunning ||
      microsoftTranslationMutation.isPending ||
      aiTranslationMutation.isPending
    ) return;
    if (!selectedProvider?.available) {
      setHenryStatus(selectedProvider?.reason ?? "Selected OCR provider is not available.");
      return;
    }
    if (scope === "page" && !currentPage) {
      setHenryStatus("No current page selected.");
      return;
    }

    const targetPageId = scope === "page" ? currentPage.id : undefined;
    const henryLabel = scope === "page" ? "Henry page" : "Henry great";
    const translationLabel = translationProvider === "ai" ? "AI translation" : "Microsoft translation";
    setHenryScope(scope);
    setHenryMenuScope(null);
    setActiveTool("typeset");
    setAutoCleanOcrText(true);
    setAutoCleanProvider("algorithm");
    setAutoCleanPolicy("force_all_regions");
    setHenryStatus(`${henryLabel}: OCR + algorithm clean...`);
    setOcrStatus("");
    setAutoTypesetStatus("");

    try {
      const ocrResult = scope === "page" && targetPageId
        ? await runOcrForPage(targetPageId, henryOcrInput)
        : await runOcrForChapter(chapterId, henryOcrInput);
      setOcrStatus(ocrResultStatus(ocrResult));

      setHenryStatus(`${henryLabel}: ${translationLabel}...`);
      const translationResult = translationProvider === "ai"
        ? await translateWithAi({
          chapterId,
          mode: "draft",
          pageId: targetPageId,
          provider: "ai",
          scope,
          translationLevel: aiTranslationLevel,
        })
        : await translateWithMicrosoft({
          chapterId,
          pageId: targetPageId,
          scope,
        });

      setHenryStatus(`${henryLabel}: auto paste + typeset...`);
      const translatedWorkspace = await getChapterForTranslation(chapterId);
      if (!translatedWorkspace) throw new Error(`Translation workspace could not be loaded after ${translationLabel}.`);
      const targetUnits = scope === "page" && targetPageId
        ? translatedWorkspace.textUnits.filter((unit) => unit.pageId === targetPageId)
        : translatedWorkspace.textUnits;
      const typesetResult = await autoTypesetUnits(
        translatedWorkspace,
        targetUnits,
        `${henryLabel} typesetting`,
        translationProvider,
      );

      const finalWorkspace = await getChapterForTranslation(chapterId);
      if (finalWorkspace) queryClient.setQueryData(["translation-workspace", chapterId], finalWorkspace);
      queryClient.invalidateQueries({ queryKey: ["project-chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });

      setAutoTypesetStatus(
        typesetResult.skipped > 0
          ? `Auto pasted ${typesetResult.pasted}. Skipped ${typesetResult.skipped} without translation.`
          : `Auto pasted ${typesetResult.pasted} text boxes.`,
      );
      setHenryStatus(
        `${henryLabel} completed with ${translationLabel}: ` +
        `${ocrResult.textUnitsCreated} OCR units, ${translationResult.translatedCount} translated, ${typesetResult.pasted} pasted.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Henry pipeline failed.";
      setHenryStatus(message);
    } finally {
      setHenryScope(null);
      queryClient.invalidateQueries({ queryKey: ["translation-workspace", chapterId] });
    }
  };
  const clearChapterOcrResults = () => {
    if (!chapterId || deleteOcrResultsMutation.isPending || workspace.textUnits.length === 0) return;
    const confirmed = window.confirm(
      "Delete OCR results for this chapter? This removes OCR text, OCR candidates, translations tied to them, and auto-clean patches. Manual edits are kept.",
    );
    if (!confirmed) return;
    deleteOcrResultsMutation.mutate({
      chapterId,
      includeAutoCleanPatches: true,
      keepManualEdits: true,
    });
  };
  const hasMergedPages = workspace.pages.some((page) => page.pageKind === "merged");
  const mergeChapterPairs = () => {
    if (!chapterId || mergeChapterPagesMutation.isPending || workspace.pages.length === 0) return;
    const confirmed = window.confirm(
      "Merge every 2 original pages in this chapter into vertical merged pages? Original pages are kept.",
    );
    if (!confirmed) return;
    mergeChapterPagesMutation.mutate({ id: chapterId });
  };
  const removeChapterMergedPages = () => {
    if (!chapterId || removeMergedPagesMutation.isPending || !hasMergedPages) return;
    const confirmed = window.confirm("Remove merged pages and return this chapter to original pages?");
    if (!confirmed) return;
    removeMergedPagesMutation.mutate(chapterId);
  };
  const runChapterExport = () => {
    if (!chapterId || exportChapterMutation.isPending || workspace.pages.length === 0) return;
    setActiveTool("export");
    setExportStatus("Choosing export folder...");
    exportChapterMutation.mutate(chapterId);
  };
  const startOcrTextSelection = () => {
    ocrSelectionRef.current = null;
    setOcrSelection(null);
    setActiveTool("ocr");
    window.requestAnimationFrame(() => {
      translationScreenRef.current?.focus({ preventScroll: true });
    });
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
  const startCleanTextSelection = () => {
    cleanSelectionRef.current = null;
    setCleanSelection(null);
    setCleanStatus("");
    setActiveTool("clean");
    window.requestAnimationFrame(() => {
      translationScreenRef.current?.focus({ preventScroll: true });
    });
  };
  const startRestoreAreaSelection = () => {
    restoreAreaSelectionRef.current = null;
    setRestoreAreaSelection(null);
    setCleanStatus("");
    setActiveTool("restore-area");
    window.requestAnimationFrame(() => {
      translationScreenRef.current?.focus({ preventScroll: true });
    });
  };
  const beginCleanSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool !== "clean" || cleanPageTextMutation.isPending || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromSvg(event, page);
    event.currentTarget.setPointerCapture(event.pointerId);
    const selection = {
      pageId: page.id,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    cleanSelectionRef.current = selection;
    setSelectedPageId(page.id);
    setCleanSelection(selection);
  };
  const moveCleanSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    const currentSelection = cleanSelectionRef.current;
    if (activeTool !== "clean" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    const point = pointFromSvg(event, page);
    const nextSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    cleanSelectionRef.current = nextSelection;
    setCleanSelection(nextSelection);
  };
  const endCleanSelection = (event: PointerEvent<SVGSVGElement>, page: Page, shouldRun = true) => {
    const currentSelection = cleanSelectionRef.current;
    if (activeTool !== "clean" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const point = pointFromSvg(event, page);
    const finalSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    if (!normalizeSelectionRegion(finalSelection)) {
      cleanSelectionRef.current = null;
      setCleanSelection(null);
      return;
    }
    cleanSelectionRef.current = finalSelection;
    setCleanSelection(finalSelection);
    if (shouldRun) runCleanSelection(finalSelection);
  };
  const beginRestoreAreaSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    if (activeTool !== "restore-area" || restoreCleanPatchAreaMutation.isPending || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromSvg(event, page);
    event.currentTarget.setPointerCapture(event.pointerId);
    const selection = {
      pageId: page.id,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    };
    restoreAreaSelectionRef.current = selection;
    setSelectedPageId(page.id);
    setRestoreAreaSelection(selection);
  };
  const moveRestoreAreaSelection = (event: PointerEvent<SVGSVGElement>, page: Page) => {
    const currentSelection = restoreAreaSelectionRef.current;
    if (activeTool !== "restore-area" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    const point = pointFromSvg(event, page);
    const nextSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    restoreAreaSelectionRef.current = nextSelection;
    setRestoreAreaSelection(nextSelection);
  };
  const endRestoreAreaSelection = (event: PointerEvent<SVGSVGElement>, page: Page, shouldRun = true) => {
    const currentSelection = restoreAreaSelectionRef.current;
    if (activeTool !== "restore-area" || !currentSelection || currentSelection.pageId !== page.id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const point = pointFromSvg(event, page);
    const finalSelection = { ...currentSelection, currentX: point.x, currentY: point.y };
    if (!normalizeSelectionRegion(finalSelection)) {
      restoreAreaSelectionRef.current = null;
      setRestoreAreaSelection(null);
      return;
    }
    restoreAreaSelectionRef.current = finalSelection;
    setRestoreAreaSelection(finalSelection);
    if (shouldRun) runRestoreAreaSelection(finalSelection);
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
  const editRegionStyle = (unit: TextUnit) => {
    const box = textBoxForUnit(unit);
    const fontSize = displayFontSizeForUnit(unit, box);
    return {
      color: normalizeHexColor(unit.typesetting.color, TYPESET_DARK_TEXT_COLOR),
      fontSize: fontSize * zoom * TYPESET_RENDER_SCALE,
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
  const renderEditMark = (mark: PageEditMark, className = "edit-mark-path") => {
    if (mark.kind === "clean_patch" && mark.region && mark.patchUrl) {
      const canRestore = activeTool === "restore-clean" && isAutoCleanPatch(mark);
      return (
        <g key={mark.id}>
          <image
            className="clean-patch-image"
            height={mark.region.height}
            href={mark.patchUrl}
            opacity={mark.opacity}
            preserveAspectRatio="none"
            width={mark.region.width}
            x={mark.region.x}
            y={mark.region.y}
          />
          {canRestore ? (
            <rect
              className="restore-clean-target"
              height={mark.region.height}
              onPointerDown={(event) => restoreAutoCleanPatch(event, mark)}
              rx={8}
              width={mark.region.width}
              x={mark.region.x}
              y={mark.region.y}
            />
          ) : null}
        </g>
      );
    }

    return (
      <path
        className={className}
        d={pointsToSvgPath(mark.points ?? [])}
        fill="none"
        key={mark.id}
        opacity={mark.opacity}
        stroke={mark.color ?? DEFAULT_BRUSH_COLOR}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={mark.size ?? DEFAULT_BRUSH_SIZE}
      />
    );
  };
  const renderDrawingLayer = (page: Page, marks: PageEditMark[]) => (
    <svg
      className={
        activeTool === "draw"
          ? "edit-drawing-layer is-drawing"
          : activeTool === "color-picker"
            ? "edit-drawing-layer is-color-picking"
            : activeTool === "clean"
              ? "edit-drawing-layer is-cleaning"
              : activeTool === "restore-clean"
                ? "edit-drawing-layer is-restoring-clean"
                : activeTool === "restore-area"
                  ? "edit-drawing-layer is-restoring-area"
                  : "edit-drawing-layer"
      }
      viewBox={`0 0 ${page.width} ${page.height}`}
      onPointerCancel={(event) => {
        if (activeTool === "clean") endCleanSelection(event, page, false);
        else if (activeTool === "restore-area") endRestoreAreaSelection(event, page, false);
        else endDrawing(event, page);
      }}
      onPointerDown={(event) => beginDrawing(event, page)}
      onPointerMove={(event) => moveDrawing(event, page)}
      onPointerUp={(event) => endDrawing(event, page)}
    >
      {activeTool === "draw" || activeTool === "color-picker" || activeTool === "clean" || activeTool === "restore-area" ? (
        <rect className="page-pointer-hitbox" x={0} y={0} width={page.width} height={page.height} />
      ) : null}
      {marks.map((mark) => renderEditMark(mark))}
      {cleanSelection?.pageId === page.id && selectedCleanRegion ? (
        <rect
          className="clean-selection-region"
          x={selectedCleanRegion.x}
          y={selectedCleanRegion.y}
          width={selectedCleanRegion.width}
          height={selectedCleanRegion.height}
          rx={10}
        />
      ) : null}
      {restoreAreaSelection?.pageId === page.id && selectedRestoreAreaRegion ? (
        <rect
          className="restore-area-selection-region"
          x={selectedRestoreAreaRegion.x}
          y={selectedRestoreAreaRegion.y}
          width={selectedRestoreAreaRegion.width}
          height={selectedRestoreAreaRegion.height}
          rx={10}
        />
      ) : null}
      {drawStroke?.pageId === page.id && drawStroke.points.length > 0 ? (
        <path
          className="edit-mark-path preview"
          d={pointsToSvgPath(drawStroke.points)}
          fill="none"
          opacity={1}
          stroke={brushColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={brushSize}
        />
      ) : null}
    </svg>
  );
  const renderOriginalPageSurface = (page: Page, units: TextUnit[], surfaceClassName = "") => (
    <div
      className={`mock-page original-page-surface page-tone-${page.imageTone} ${
        activeTool === "color-picker" ? "is-color-picking" : ""
      } ${surfaceClassName}`.trim()}
      data-page-id={page.id}
      onPointerDown={(event) => {
        if (activeTool === "color-picker") void pickColorFromPage(event, page);
      }}
      style={pageSurfaceStyle(page)}
    >
      {renderPageArtwork(page)}
      <svg
        className={
          activeTool === "ocr"
            ? "region-layer is-selecting"
            : activeTool === "color-picker"
              ? "region-layer is-color-picking"
              : activeTool === "clean"
                ? "region-layer is-cleaning"
                : "region-layer"
        }
        tabIndex={0}
        viewBox={`0 0 ${page.width} ${page.height}`}
        onPointerDown={(event) => {
          if (activeTool === "color-picker") void pickColorFromPage(event, page);
          else if (activeTool === "clean") beginCleanSelection(event, page);
          else beginOcrSelection(event, page);
        }}
        onPointerMove={(event) => {
          if (activeTool === "clean") moveCleanSelection(event, page);
          else moveOcrSelection(event, page);
        }}
        onPointerUp={(event) => {
          if (activeTool === "clean") endCleanSelection(event, page);
          else endOcrSelection(event, page);
        }}
        onPointerCancel={(event) => {
          if (activeTool === "clean") endCleanSelection(event, page, false);
          else endOcrSelection(event, page, false);
        }}
      >
        {activeTool === "ocr" || activeTool === "color-picker" || activeTool === "clean" ? (
          <rect className="page-pointer-hitbox" x={0} y={0} width={page.width} height={page.height} />
        ) : null}
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
              if (activeTool !== "ocr" && activeTool !== "color-picker") selectTextUnit(unit);
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
        {cleanSelection?.pageId === page.id && selectedCleanRegion ? (
          <rect
            className="clean-selection-region"
            x={selectedCleanRegion.x}
            y={selectedCleanRegion.y}
            width={selectedCleanRegion.width}
            height={selectedCleanRegion.height}
            rx={10}
          />
        ) : null}
      </svg>
    </div>
  );
  const renderEditPageSurface = (page: Page, units: TextUnit[], marks: PageEditMark[], surfaceClassName = "") => (
    <div
      className={`mock-page edit-page-surface page-tone-${page.imageTone} ${
        activeTool === "color-picker" ? "is-color-picking" : ""
      } ${surfaceClassName}`.trim()}
      data-page-id={page.id}
      onPointerDown={(event) => {
        if (activeTool === "color-picker") void pickColorFromPage(event, page);
      }}
      style={pageSurfaceStyle(page)}
    >
      {renderPageArtwork(page)}
      {renderDrawingLayer(page, marks)}
      <div className={activeTool === "draw" || activeTool === "color-picker" || activeTool === "clean" || activeTool === "restore-clean" || activeTool === "restore-area" ? "edit-work-layer is-passive" : "edit-work-layer"}>
        {units.map((unit) => {
          const label = getOverlayText(unit);
          const isSelected = unit.id === selectedTextUnit?.id;
          if (!label && !isSelected) return null;
          return (
            <div className="edit-text-item" key={unit.id}>
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
      <div
        aria-hidden="true"
        className="auto-typeset-measure"
        dir="rtl"
        ref={autoTypesetMeasureRef}
      />
      <header className="translation-topbar">
        <button className="floirs-button floirs-button--icon" onClick={() => navigate(`/projects/${projectId}`)} title="Back">
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
          <label className="compact-number-field" title="Number of pages processed in parallel for Chapter OCR">
            <span>Workers</span>
            <input
              className="compact-number-input"
              max={MAX_PAGE_WORKERS}
              min={MIN_PAGE_WORKERS}
              onChange={(event) => setOcrPageWorkers(clampPageWorkers(Number(event.target.value)))}
              type="number"
              value={ocrPageWorkers}
            />
          </label>
          <label className="compact-check" title="Replace existing OCR text units on selected pages">
            <input
              type="checkbox"
              checked={replaceOcrText}
              onChange={(event) => setReplaceOcrText(event.target.checked)}
            />
            Replace
          </label>
          <button
            className="floirs-button"
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
            className="floirs-button"
            disabled={isOcrRunning || !selectedProvider?.available}
            onClick={runWholeChapterOcr}
          >
            <Layers3 size={15} />
            Chapter OCR
          </button>
          <button
            className="floirs-button"
            disabled={deleteOcrResultsMutation.isPending || workspace.textUnits.length === 0}
            onClick={clearChapterOcrResults}
            title="Delete OCR results in this chapter"
            type="button"
          >
            <Trash2 size={15} />
            Clear OCR
          </button>
          <button
            className="floirs-button"
            disabled={mergeChapterPagesMutation.isPending || workspace.pages.length === 0}
            onClick={mergeChapterPairs}
            title="Merge every two original pages vertically"
            type="button"
          >
            <Layers3 size={15} />
            Merge pages
          </button>
          <button
            className="floirs-button"
            disabled={removeMergedPagesMutation.isPending || !hasMergedPages}
            onClick={removeChapterMergedPages}
            title="Remove merged pages"
            type="button"
          >
            <X size={15} />
            Unmerge
          </button>
          <div className="henry-provider-picker">
            <button
              className={henryMenuScope === "page" ? "floirs-button active-command" : "floirs-button"}
              disabled={isHenryBlocked}
              onClick={() => setHenryMenuScope((current) => current === "page" ? null : "page")}
              title="Choose translation provider for Henry page"
              type="button"
            >
              <Wand2 size={15} />
              henry page
              <ChevronDown size={14} />
            </button>
            {henryMenuScope === "page" ? (
              <div className="henry-provider-menu">
                <button type="button" onClick={() => void runHenryPipeline("page", "microsoft")}>
                  <Languages size={14} />
                  Microsoft translation
                </button>
                <button type="button" onClick={() => void runHenryPipeline("page", "ai")}>
                  <Sparkles size={14} />
                  AI translation
                </button>
              </div>
            ) : null}
          </div>
          <div className="henry-provider-picker">
            <button
              className={henryMenuScope === "chapter" ? "floirs-button active-command" : "floirs-button"}
              disabled={isHenryBlocked}
              onClick={() => setHenryMenuScope((current) => current === "chapter" ? null : "chapter")}
              title="Choose translation provider for Henry great"
              type="button"
            >
              <Sparkles size={15} />
              Henry great
              <ChevronDown size={14} />
            </button>
            {henryMenuScope === "chapter" ? (
              <div className="henry-provider-menu">
                <button type="button" onClick={() => void runHenryPipeline("chapter", "microsoft")}>
                  <Languages size={14} />
                  Microsoft translation
                </button>
                <button type="button" onClick={() => void runHenryPipeline("chapter", "ai")}>
                  <Sparkles size={14} />
                  AI translation
                </button>
              </div>
            ) : null}
          </div>
          <select
            className="field-select translation-scope-select"
            disabled={aiTranslationMutation.isPending}
            onChange={(event) => setAiTranslationLevel(Number(event.target.value) as TranslationLevel)}
            title="AI Arabic style level"
            value={aiTranslationLevel}
          >
            <option value={1}>AI L1</option>
            <option value={2}>AI L2</option>
            <option value={3}>AI L3</option>
            <option value={4}>AI L4</option>
            <option value={5}>AI L5</option>
          </select>
          <select
            className="field-select translation-scope-select"
            disabled={aiTranslationMutation.isPending}
            onChange={(event) => setAiScope(event.target.value as "selected" | "page" | "chapter")}
            title="AI translation scope"
            value={aiScope}
          >
            <option value="selected">AI Selected</option>
            <option value="page">AI Page</option>
            <option value="chapter">AI Chapter</option>
          </select>
          <button
            className="floirs-button"
            disabled={aiTranslationMutation.isPending || workspace.textUnits.length === 0}
            onClick={runAiTranslation}
            title={`Translate ${aiScope} with AI`}
            type="button"
          >
            {aiTranslationMutation.isPending ? <RefreshCw className="spin" size={15} /> : <Sparkles size={15} />}
            AI Translate
          </button>
          <select
            className="field-select translation-scope-select"
            disabled={microsoftTranslationMutation.isPending}
            onChange={(event) => setMicrosoftScope(event.target.value as "page" | "chapter")}
            title="Microsoft translation scope when no OCR result is selected"
            value={microsoftScope}
          >
            <option value="page">MS Page</option>
            <option value="chapter">MS Chapter</option>
          </select>
          <button
            className="floirs-button"
            disabled={microsoftTranslationMutation.isPending || workspace.textUnits.length === 0}
            onClick={runMicrosoftTranslation}
            title={explicitSelectedTextUnit ? "Translate selected text with Microsoft" : `Translate ${microsoftScope} with Microsoft`}
            type="button"
          >
            <Languages size={15} />
            Microsoft
          </button>
          <button className="floirs-button"><ShieldCheck size={15} />Quality</button>
          <button
            className="floirs-button"
            disabled={exportChapterMutation.isPending || workspace.pages.length === 0}
            onClick={runChapterExport}
            title="Export edited chapter pages as PNG files"
            type="button"
          >
            {exportChapterMutation.isPending ? <RefreshCw className="spin" size={15} /> : <Download size={15} />}
            Export
          </button>
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
          <div className="ocr-options-panel">
            <div className="ocr-options-head">
              <strong>Auto-clean OCR</strong>
              <span>{autoCleanOcrText ? "On" : "Off"}</span>
            </div>
            <label className="compact-check" title="Automatically delete recognized source text from the edit page after OCR">
              <input
                type="checkbox"
                checked={autoCleanOcrText}
                onChange={(event) => setAutoCleanOcrText(event.target.checked)}
              />
              Clean after OCR
            </label>
            <label className="ocr-option-field">
              <span>Cleaner</span>
              <select
                className="field-select"
                disabled={!autoCleanOcrText}
                value={autoCleanProvider}
                onChange={(event) => setAutoCleanProvider(event.target.value as CleanProviderId)}
              >
                <option value="algorithm">الخوارزمية - Recommended</option>
                <option value="bubble_fill">Bubbles</option>
                <option value="free_text_inpaint">Free text</option>
                <option value="lama">LaMa</option>
              </select>
            </label>
            <label className="ocr-option-field">
              <span>Policy</span>
              <select
                className="field-select"
                disabled={!autoCleanOcrText || autoCleanProvider === "algorithm"}
                value={autoCleanProvider === "algorithm" ? "force_all_regions" : autoCleanPolicy}
                onChange={(event) => setAutoCleanPolicy(event.target.value as CleanPolicy)}
              >
                <option value="safe_bubbles_only">Safe bubbles only</option>
                <option value="force_all_regions">Force OCR text</option>
              </select>
            </label>
            <label className="ocr-option-field">
              <span>Expansion: {autoCleanMaskExpansion}px</span>
              <input
                disabled={!autoCleanOcrText}
                max={12}
                min={0}
                onChange={(event) => setAutoCleanMaskExpansion(Number(event.target.value))}
                type="range"
                value={autoCleanMaskExpansion}
              />
            </label>
          </div>
          {ocrError ? <p className="error-line ocr-status-line">{ocrError}</p> : null}
          {ocrStatus ? <p className="ocr-status-line">{ocrStatus}</p> : null}
          {isOcrRunning && !isHenryRunning ? <p className="ocr-status-line">Running OCR...</p> : null}
          {microsoftTranslationMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{microsoftTranslationMutation.error.message}</p>
          ) : null}
          {microsoftTranslationMutation.isPending ? (
            <p className="ocr-status-line">Running Microsoft translation...</p>
          ) : null}
          {aiTranslationMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{aiTranslationMutation.error.message}</p>
          ) : null}
          {aiTranslationMutation.isPending ? (
            <p className="ocr-status-line">Running AI translation...</p>
          ) : null}
          {aiTranslationStatus && !(aiTranslationMutation.error instanceof Error) ? (
            <p className="ocr-status-line">{aiTranslationStatus}</p>
          ) : null}
          {henryStatus ? (
            <p className="ocr-status-line">{henryStatus}</p>
          ) : null}
          {exportChapterMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{exportChapterMutation.error.message}</p>
          ) : null}
          {exportChapterMutation.isPending ? (
            <p className="ocr-status-line">Exporting chapter pages...</p>
          ) : null}
          {exportStatus ? (
            <p className="ocr-status-line">{exportStatus}</p>
          ) : null}
          {deleteOcrResultsMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{deleteOcrResultsMutation.error.message}</p>
          ) : null}
          {deleteOcrResultsMutation.isPending ? (
            <p className="ocr-status-line">Deleting OCR results...</p>
          ) : null}
          {mergeChapterPagesMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{mergeChapterPagesMutation.error.message}</p>
          ) : null}
          {removeMergedPagesMutation.error instanceof Error ? (
            <p className="error-line ocr-status-line">{removeMergedPagesMutation.error.message}</p>
          ) : null}
          {mergeChapterPagesMutation.isPending ? (
            <p className="ocr-status-line">Merging chapter pages...</p>
          ) : null}
          {removeMergedPagesMutation.isPending ? (
            <p className="ocr-status-line">Removing merged pages...</p>
          ) : null}
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
              <button className="floirs-button floirs-button--icon" onClick={() => setZoom(zoom - 0.08)} title="Zoom out">
                <ZoomOut size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="floirs-button floirs-button--icon" onClick={() => setZoom(zoom + 0.08)} title="Zoom in">
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
              <div
                className={viewerMode === "webtoon" ? "pane-page-scroll webtoon-stage" : "pane-page-scroll"}
                onScroll={() => syncPaneScroll("original")}
                ref={originalPaneScrollRef}
              >
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
              <div
                className={viewerMode === "webtoon" ? "pane-page-scroll webtoon-stage" : "pane-page-scroll"}
                onScroll={() => syncPaneScroll("edit")}
                ref={editPaneScrollRef}
              >
                {viewerMode === "page" ? (
                  renderEditPageSurface(currentPage, pageTextUnits, currentPageEditMarks)
                ) : (
                  <div className={mergePages ? "webtoon-page-stack merged" : "webtoon-page-stack"}>
                    {workspace.pages.map((page) => {
                      const units = textUnitsByPage.get(page.id) ?? [];
                      const marks = editMarksByPage.get(page.id) ?? [];
                      return (
                        <div
                          className={page.id === currentPage.id ? "webtoon-page-anchor active" : "webtoon-page-anchor"}
                          data-page-index={page.index}
                          key={page.id}
                          ref={(element) => {
                            editPageRefs.current[page.id] = element;
                          }}
                        >
                          {renderEditPageSurface(page, units, marks, "webtoon-page-surface")}
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
              ["export", Download],
            ]}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />
          <ToolGroup
            title="Editing"
            tools={[
              ["draw", PenTool],
              ["color-picker", Pipette],
              ["clean", Eraser],
              ["restore-clean", RefreshCw],
              ["restore-area", Highlighter],
              ["typeset", Type],
            ]}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />
          <div className="tool-panel">
            <h3>Selected Text</h3>
            <p>{selectedTextUnit?.sourceText}</p>
            <small>{selectedTextUnit?.reviewStatus}</small>
          </div>
          <div className="tool-panel draw-panel">
            <h3>Brush</h3>
            <div className="brush-color-row">
              <input
                aria-label="Brush color"
                className="brush-color-input"
                onChange={(event) => {
                  setBrushColor(event.target.value.toUpperCase());
                  setColorPickStatus(event.target.value.toUpperCase());
                }}
                type="color"
                value={brushColor}
              />
              <button
                className={activeTool === "color-picker" ? "button secondary active-command" : "button secondary"}
                onClick={() => setActiveTool("color-picker")}
                type="button"
              >
                <Pipette size={15} />
                Pick
              </button>
            </div>
            <div className="brush-size-row">
              <span>Size</span>
              <input
                className="brush-size-range"
                max={MAX_BRUSH_SIZE}
                min={MIN_BRUSH_SIZE}
                onChange={(event) => setBrushSize(clampBrushSize(Number(event.target.value)))}
                type="range"
                value={brushSize}
              />
              <input
                className="brush-size-input"
                max={MAX_BRUSH_SIZE}
                min={MIN_BRUSH_SIZE}
                onChange={(event) => setBrushSize(clampBrushSize(Number(event.target.value)))}
                type="number"
                value={brushSize}
              />
            </div>
            <button
              className="button secondary full-width"
              disabled={!lastCurrentPageEditMark || deletePageEditMarkMutation.isPending}
              onClick={undoCurrentPageStroke}
              type="button"
            >
              <Undo2 size={15} />
              Undo edit
            </button>
            {colorPickStatus ? <small className="brush-status">{colorPickStatus}</small> : null}
          </div>
          <div className="tool-panel clean-panel">
            <h3>Smart Clean</h3>
            <button
              className={activeTool === "clean" ? "button secondary full-width active-command" : "button secondary full-width"}
              disabled={cleanPageTextMutation.isPending}
              onClick={startCleanTextSelection}
              type="button"
            >
              <Eraser size={15} />
              Clean Text
            </button>
            <button
              className={activeTool === "restore-clean" ? "button secondary full-width active-command" : "button secondary full-width"}
              disabled={deletePageEditMarkMutation.isPending || currentPageAutoCleanPatchCount === 0}
              onClick={() => setActiveTool("restore-clean")}
              type="button"
            >
              <RefreshCw size={15} />
              Restore Patch
            </button>
            <button
              className={activeTool === "restore-area" ? "button secondary full-width active-command" : "button secondary full-width"}
              disabled={restoreCleanPatchAreaMutation.isPending}
              onClick={startRestoreAreaSelection}
              type="button"
            >
              <Highlighter size={15} />
              Restore Area
            </button>
            <label className="clean-control">
              <span>Cleaner</span>
              <select
                disabled={cleanPageTextMutation.isPending}
                onChange={(event) => setCleanProvider(event.target.value as CleanProviderId)}
                value={cleanProvider}
              >
                <option value="algorithm">الخوارزمية - Recommended</option>
                <option value="bubble_fill">Bubbles</option>
                <option value="free_text_inpaint">Free text</option>
                <option value="lama">LaMa</option>
                <option value="opencv_telea">OpenCV Fast</option>
                <option value="opencv_ns">OpenCV Smooth</option>
              </select>
            </label>
            <label className="clean-control">
              <span>Method</span>
              <select
                disabled={cleanPageTextMutation.isPending}
                onChange={(event) => setCleanMethod(event.target.value === "ns" ? "ns" : "telea")}
                value={cleanMethod}
              >
                <option value="telea">Fast</option>
                <option value="ns">Smooth</option>
              </select>
            </label>
            <div className="brush-size-row">
              <span>Strength</span>
              <input
                className="brush-size-range"
                disabled={cleanPageTextMutation.isPending}
                max={MAX_CLEAN_STRENGTH}
                min={MIN_CLEAN_STRENGTH}
                onChange={(event) => setCleanStrength(clampCleanStrength(Number(event.target.value)))}
                type="range"
                value={cleanStrength}
              />
              <input
                className="brush-size-input"
                disabled={cleanPageTextMutation.isPending}
                max={MAX_CLEAN_STRENGTH}
                min={MIN_CLEAN_STRENGTH}
                onChange={(event) => setCleanStrength(clampCleanStrength(Number(event.target.value)))}
                type="number"
                value={cleanStrength}
              />
            </div>
            {cleanStatus ? <small className="brush-status">{cleanStatus}</small> : null}
          </div>
          <div className="tool-panel auto-typeset-panel">
            <h3>Auto Typeset</h3>
            <button
              className="button secondary full-width"
              disabled={!selectedTextUnit || !getAutoTypesetText(selectedTextUnit) || isAutoTypesetting}
              onClick={autoFitSelectedText}
              title="Fit the selected translated text inside its current text box"
              type="button"
            >
              <Type size={15} />
              Fit selected
            </button>
            <button
              className="button secondary full-width"
              disabled={currentPageTranslatedUnitCount === 0 || isAutoTypesetting}
              onClick={autoPasteCurrentPage}
              title="Place and fit all translated text units on the current page"
              type="button"
            >
              <Wand2 size={15} />
              Auto paste page
            </button>
            <small className="auto-typeset-hint">
              {currentPageTranslatedUnitCount}/{pageTextUnits.length} translated on current page
            </small>
            {autoTypesetStatus ? <small className="brush-status">{autoTypesetStatus}</small> : null}
          </div>
          <div className="tool-panel text-size-panel">
            <h3>Text Size</h3>
            <div className="text-size-control">
              <span>All text</span>
              <div className="text-size-buttons">
                <button
                  className="floirs-button floirs-button--icon"
                  disabled={updateChapterTextSizeMutation.isPending || workspace.textUnits.length === 0}
                  onClick={() => adjustAllTextFontSizes(-TEXT_UNIT_FONT_STEP)}
                  title="Decrease all text"
                  type="button"
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  className="floirs-button floirs-button--icon"
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
                  className="floirs-button floirs-button--icon"
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
                  className="floirs-button floirs-button--icon"
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
            className="floirs-button floirs-button--icon"
            title="Open characters dictionary"
            to={`/projects/${projectId}?tab=dictionary&section=characters`}
          >
            <Plus size={15} />
          </Link>
          <Link
            className="floirs-button floirs-button--icon"
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
            className="floirs-button floirs-button--icon danger"
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
      {unit.cleanStatus ? (
        <div className="text-unit-meta">
          <span>Clean: {unit.cleanStatus}</span>
          {unit.cleanClassification ? <span>{unit.cleanClassification}</span> : null}
        </div>
      ) : null}
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
          className="floirs-button"
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
