import type { CSSProperties } from "react";
import type { Page } from "../types/domain";
import type {
  CompositionBackground,
  CompositionEffects,
  CompositionShadow,
  CompositionStroke,
  CompositionStyle,
  TextComposition,
  TextCompositionSpan,
  TextHorizontalAlign,
  TextVerticalAlign,
} from "./types";

const TEXT_COMPOSITION_RENDER_SCALE = 2.35;

interface TextCompositionLayerProps {
  compositions: TextComposition[];
  page: Page;
  zoom: number;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function flexAlign(value: TextVerticalAlign) {
  if (value === "top") return "flex-start";
  if (value === "bottom") return "flex-end";
  return "center";
}

function flexJustify(value: TextHorizontalAlign) {
  if (value === "left") return "flex-start";
  if (value === "right") return "flex-end";
  return "center";
}

function cssOpacity(value: number | undefined) {
  return clamp(value ?? 1, 0, 1);
}

function shadowCss(shadow: CompositionShadow | undefined, zoom: number) {
  if (!shadow?.enabled) return undefined;
  return `${shadow.x * zoom}px ${shadow.y * zoom}px ${shadow.blur * zoom}px ${shadow.color}`;
}

function strokeCss(stroke: CompositionStroke | undefined, zoom: number) {
  if (!stroke?.enabled) return undefined;
  return `${Math.max(0, stroke.width * zoom)}px ${stroke.color}`;
}

function backgroundStyle(background: CompositionBackground | undefined, zoom: number): CSSProperties {
  if (!background?.enabled) return {};
  return {
    backgroundColor: background.color,
    borderRadius: (background.radius ?? 0) * zoom,
    padding: `${(background.paddingY ?? 0) * zoom}px ${(background.paddingX ?? 0) * zoom}px`,
  };
}

function mergeEffects(composition: TextComposition, span?: TextCompositionSpan): CompositionEffects {
  return {
    ...composition.effects,
    ...span?.effects,
    shadow: span?.effects?.shadow ?? composition.effects?.shadow ?? composition.style.shadow,
    stroke: span?.effects?.stroke ?? composition.effects?.stroke ?? composition.style.stroke,
    background: span?.effects?.background ?? composition.effects?.background,
  };
}

function mergeStyle(base: CompositionStyle, span?: TextCompositionSpan): CompositionStyle {
  return {
    ...base,
    ...span?.style,
  };
}

function spanStyle(composition: TextComposition, span: TextCompositionSpan | undefined, zoom: number): CSSProperties {
  const style = mergeStyle(composition.style, span);
  const effects = mergeEffects(composition, span);
  const stroke = strokeCss(effects.stroke ?? style.stroke, zoom);

  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: Math.max(1, style.fontSize * zoom * TEXT_COMPOSITION_RENDER_SCALE),
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing ? style.letterSpacing * zoom : undefined,
    lineHeight: composition.layout.lineHeight,
    opacity: cssOpacity(style.opacity),
    paintOrder: stroke ? "stroke fill" : undefined,
    textShadow: shadowCss(effects.shadow ?? style.shadow, zoom),
    WebkitTextStroke: stroke,
  };
}

function compositionStyle(composition: TextComposition, zoom: number): CSSProperties {
  const { box, layout } = composition;
  const effects = mergeEffects(composition);

  return {
    ...backgroundStyle(effects.background, zoom),
    alignItems: flexAlign(layout.verticalAlign),
    boxSizing: "border-box",
    direction: layout.direction === "auto" ? undefined : layout.direction,
    height: Math.max(1, box.height * zoom),
    justifyContent: flexJustify(layout.align),
    left: box.x * zoom,
    opacity: cssOpacity(composition.style.opacity),
    overflow: "visible",
    padding: `${layout.paddingY * zoom}px ${layout.paddingX * zoom}px`,
    textAlign: layout.align,
    top: box.y * zoom,
    transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
    transformOrigin: "center center",
    width: Math.max(1, box.width * zoom),
    wordBreak: layout.allowWordBreak || layout.wrapMode === "character" ? "break-word" : "normal",
  };
}

function compositionSpans(composition: TextComposition): TextCompositionSpan[] {
  const spans = composition.content?.spans.filter((span) => span.text.length > 0) ?? [];
  if (spans.length > 0) return spans;
  return [{ text: composition.plainText }];
}

export function TextCompositionLayer({ compositions, page, zoom }: TextCompositionLayerProps) {
  const sortedCompositions = [...compositions].sort((a, b) => a.renderOrder - b.renderOrder);

  return (
    <div className="text-composition-layer" data-page-id={page.id} data-page-tone={page.imageTone}>
      {sortedCompositions.map((composition) => (
        <div
          className="text-composition-item"
          data-composition-kind={composition.kind}
          key={composition.id}
          style={compositionStyle(composition, zoom)}
          title={composition.plainText}
        >
          <span className="text-composition-content" dir={composition.layout.direction === "auto" ? "auto" : composition.layout.direction}>
            {compositionSpans(composition).map((span, index) => (
              <span className="text-composition-span" key={`${composition.id}-${index}`} style={spanStyle(composition, span, zoom)}>
                {span.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
