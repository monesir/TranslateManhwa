import type { RegionBox } from "../types/domain";

export type TextEngineMode = "legacy" | "composition-preview" | "composition";

export type TextCompositionKind =
  | "dialogue"
  | "thought"
  | "narration"
  | "shout"
  | "whisper"
  | "aside"
  | "sfx"
  | "title"
  | "sign"
  | "unknown";

export type TextCompositionSource =
  | "auto"
  | "henry"
  | "manual"
  | "legacy"
  | "imported";

export type TextDirection = "auto" | "rtl" | "ltr";
export type TextHorizontalAlign = "left" | "center" | "right" | "justify";
export type TextVerticalAlign = "top" | "middle" | "bottom";
export type TextFitMode = "none" | "shrink_to_fit" | "grow_to_fill";
export type TextWrapMode = "word" | "character" | "manual";

export type TextCompositionManualField =
  | "plainText"
  | "content"
  | "box"
  | "preset"
  | "kind"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "color"
  | "opacity"
  | "stroke"
  | "shadow"
  | "background"
  | "layout"
  | "effects"
  | "renderOrder";

export interface CompositionStroke {
  color: string;
  enabled: boolean;
  opacity?: number;
  width: number;
}

export interface CompositionShadow {
  blur: number;
  color: string;
  enabled: boolean;
  opacity?: number;
  x: number;
  y: number;
}

export interface CompositionBackground {
  color: string;
  enabled: boolean;
  opacity?: number;
  paddingX?: number;
  paddingY?: number;
  radius?: number;
}

export interface CompositionStyle {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  letterSpacing?: number;
  opacity: number;
  shadow?: CompositionShadow;
  stroke?: CompositionStroke;
}

export interface CompositionLayout {
  allowWordBreak: boolean;
  align: TextHorizontalAlign;
  direction: TextDirection;
  fitMode: TextFitMode;
  lineHeight: number;
  maxLines?: number | null;
  paddingX: number;
  paddingY: number;
  rotation: number;
  verticalAlign: TextVerticalAlign;
  wrapMode: TextWrapMode;
}

export interface CompositionEffects {
  background?: CompositionBackground;
  shadow?: CompositionShadow;
  stroke?: CompositionStroke;
}

export interface TextCompositionSpan {
  effects?: CompositionEffects;
  style?: Partial<CompositionStyle>;
  text: string;
}

export interface TextCompositionContent {
  spans: TextCompositionSpan[];
  version: 1;
}

export interface TextCompositionOrigin {
  algorithmVersion?: string;
  createdBy: TextCompositionSource;
  ocrRunId?: string | null;
  translationProvider?: "ai" | "microsoft" | "manual" | null;
}

export interface TextStylePreset {
  createdAt: string;
  effects?: CompositionEffects;
  id: string;
  isDefault: boolean;
  kind: TextCompositionKind;
  layout: CompositionLayout;
  name: string;
  projectId?: string | null;
  style: CompositionStyle;
  updatedAt: string;
}

export interface TextComposition {
  box: RegionBox;
  chapterId: string;
  content?: TextCompositionContent | null;
  createdAt: string;
  effects?: CompositionEffects;
  id: string;
  isLocked: boolean;
  kind: TextCompositionKind;
  layout: CompositionLayout;
  manualFields: TextCompositionManualField[];
  origin?: TextCompositionOrigin | null;
  pageId: string;
  plainText: string;
  presetId?: string | null;
  renderOrder: number;
  source: TextCompositionSource;
  style: CompositionStyle;
  textUnitId?: string | null;
  updatedAt: string;
}

export type TextStylePresetInput = Pick<
  TextStylePreset,
  "effects" | "kind" | "layout" | "name" | "projectId" | "style"
> & {
  isDefault?: boolean;
};

export type TextCompositionInput = Pick<
  TextComposition,
  "box" | "chapterId" | "effects" | "kind" | "layout" | "pageId" | "plainText" | "source" | "style"
> & {
  content?: TextCompositionContent | null;
  manualFields?: TextCompositionManualField[];
  origin?: TextCompositionOrigin | null;
  presetId?: string | null;
  renderOrder?: number;
  textUnitId?: string | null;
};
