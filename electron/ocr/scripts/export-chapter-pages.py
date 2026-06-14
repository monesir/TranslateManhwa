import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except Exception:
    arabic_reshaper = None
    get_display = None


DEFAULT_TEXT_COLOR = "#17110B"
TEXT_RENDER_SCALE = 2.35
LINE_HEIGHT = 1.28
PADDING_X = 5
PADDING_Y = 4


def has_arabic(text):
    return any("\u0600" <= char <= "\u06ff" or "\u0750" <= char <= "\u077f" for char in text)


def shape_text(text):
    if has_arabic(text) and arabic_reshaper and get_display:
        return get_display(arabic_reshaper.reshape(text))
    return text


def text_bbox(draw, text, font, stroke_width=1):
    if not text:
        return 0, 0
    bbox = draw.textbbox((0, 0), shape_text(text), font=font, stroke_width=max(0, int(round(stroke_width or 0))))
    return max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])


def wrap_characters(draw, text, font, max_width, stroke_width=1):
    lines = []
    current = ""
    for char in str(text or ""):
        if char in "\r\n":
            if current:
                lines.append(current)
            current = ""
            continue
        candidate = f"{current}{char}"
        width, _ = text_bbox(draw, candidate, font, stroke_width)
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def wrap_text(draw, text, font, max_width, split_long_words=True, wrap_mode="word", stroke_width=1):
    paragraphs = [paragraph.strip() for paragraph in str(text or "").splitlines() if paragraph.strip()]
    if not paragraphs:
        return []
    if wrap_mode == "character":
        return wrap_characters(draw, "\n".join(paragraphs), font, max_width, stroke_width)

    def split_long_word(word):
        chunks = []
        current = ""
        for char in word:
            candidate = f"{current}{char}"
            width, _ = text_bbox(draw, candidate, font, stroke_width)
            if width <= max_width or not current:
                current = candidate
            else:
                chunks.append(current)
                current = char
        if current:
            chunks.append(current)
        return chunks

    lines = []
    for paragraph in paragraphs:
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            width, _ = text_bbox(draw, candidate, font, stroke_width)
            if width <= max_width or not current:
                if split_long_words and not current and width > max_width:
                    lines.extend(split_long_word(word))
                    current = ""
                else:
                    current = candidate
            else:
                lines.append(current)
                word_width, _ = text_bbox(draw, word, font, stroke_width)
                if split_long_words and word_width > max_width:
                    lines.extend(split_long_word(word))
                    current = ""
                else:
                    current = word
        if current:
            lines.append(current)
    return lines


def fit_lines(draw, text, font_path, requested_size, width, height):
    size = max(8, int(round(float(requested_size or 18) * TEXT_RENDER_SCALE)))
    max_width = max(1, width - PADDING_X * 2)
    max_height = max(1, height - PADDING_Y * 2)

    while size >= 8:
        font = ImageFont.truetype(font_path, size=size)
        lines = wrap_text(draw, text, font, max_width)
        line_height = max(1, int(math.ceil(size * LINE_HEIGHT)))
        total_height = line_height * len(lines)
        widest = max((text_bbox(draw, line, font)[0] for line in lines), default=0)
        if lines and widest <= max_width + 1 and total_height <= max_height + 1:
            return font, lines, line_height
        size -= 1

    font = ImageFont.truetype(font_path, size=8)
    return font, wrap_text(draw, text, font, max_width), int(math.ceil(8 * LINE_HEIGHT))


def clamp(value, min_value, max_value):
    try:
        number = float(value)
    except Exception:
        return min_value
    return max(min_value, min(max_value, number))


def composition_text(composition):
    content = composition.get("content") or {}
    spans = content.get("spans") if isinstance(content, dict) else None
    if isinstance(spans, list) and spans:
        text = "".join(str(span.get("text") or "") for span in spans if isinstance(span, dict))
    else:
        text = str(composition.get("plainText") or "")
    return text.strip()


def composition_effect(composition, name):
    effects = composition.get("effects") or {}
    style = composition.get("style") or {}
    if isinstance(effects, dict) and effects.get(name):
        return effects.get(name)
    if isinstance(style, dict) and style.get(name):
        return style.get(name)
    return None


def composition_font_size(style):
    return max(8, int(round(float(style.get("fontSize") or 18) * TEXT_RENDER_SCALE)))


def composition_stroke_width(stroke):
    if not isinstance(stroke, dict) or not stroke.get("enabled"):
        return 0
    return max(0, int(round(float(stroke.get("width") or 0))))


def fit_composition_lines(draw, text, font_path, style, layout, width, height, stroke_width):
    requested_size = composition_font_size(style)
    padding_x = max(0, float(layout.get("paddingX", PADDING_X)))
    padding_y = max(0, float(layout.get("paddingY", PADDING_Y)))
    line_height_factor = max(0.8, float(layout.get("lineHeight", LINE_HEIGHT) or LINE_HEIGHT))
    wrap_mode = str(layout.get("wrapMode") or "word")
    split_long_words = bool(layout.get("allowWordBreak")) or wrap_mode == "character"
    fit_mode = str(layout.get("fitMode") or "shrink_to_fit")
    max_width = max(1, width - padding_x * 2)
    max_height = max(1, height - padding_y * 2)

    def build_lines(size):
        font = ImageFont.truetype(font_path, size=size)
        lines = wrap_text(
            draw,
            text,
            font,
            max_width,
            split_long_words=split_long_words,
            wrap_mode=wrap_mode,
            stroke_width=stroke_width,
        )
        line_height = max(1, int(math.ceil(size * line_height_factor)))
        return font, lines, line_height

    if fit_mode != "shrink_to_fit":
        return build_lines(requested_size)

    size = requested_size
    while size >= 8:
        font, lines, line_height = build_lines(size)
        total_height = line_height * len(lines)
        widest = max((text_bbox(draw, line, font, stroke_width)[0] for line in lines), default=0)
        if lines and widest <= max_width + 1 and total_height <= max_height + 1:
            return font, lines, line_height
        size -= 1

    return build_lines(8)


def rgba(color, opacity=1):
    value = str(color or "#000000").strip()
    if value.startswith("#"):
        value = value[1:]
    if len(value) == 3:
        value = "".join(part * 2 for part in value)
    try:
        red = int(value[0:2], 16)
        green = int(value[2:4], 16)
        blue = int(value[4:6], 16)
    except Exception:
        red, green, blue = 0, 0, 0
    opacity_value = 1 if opacity is None else opacity
    alpha = max(0, min(255, int(round(float(opacity_value) * 255))))
    return red, green, blue, alpha


def text_rgba(color):
    return rgba(color or DEFAULT_TEXT_COLOR, 1)


def alpha_composite_at(base, overlay, x, y):
    x = int(round(x))
    y = int(round(y))
    if overlay.width <= 0 or overlay.height <= 0:
        return
    left = max(0, x)
    top = max(0, y)
    right = min(base.width, x + overlay.width)
    bottom = min(base.height, y + overlay.height)
    if right <= left or bottom <= top:
        return
    crop = overlay.crop((left - x, top - y, right - x, bottom - y))
    base.alpha_composite(crop, (left, top))


def draw_rounded_rectangle(draw, bounds, radius, fill):
    if radius > 0:
        draw.rounded_rectangle(bounds, radius=radius, fill=fill)
    else:
        draw.rectangle(bounds, fill=fill)


def paste_patch(base, mark):
    region = mark.get("region") or {}
    patch_path = mark.get("patchPath")
    if not patch_path:
        return

    x = int(round(float(region.get("x", 0))))
    y = int(round(float(region.get("y", 0))))
    width = int(round(float(region.get("width", 0))))
    height = int(round(float(region.get("height", 0))))
    if width <= 0 or height <= 0:
        return

    patch = Image.open(patch_path).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
    opacity = max(0, min(1, float(mark.get("opacity", 1))))
    if opacity < 1:
        alpha = patch.getchannel("A").point(lambda value: int(value * opacity))
        patch.putalpha(alpha)
    base.alpha_composite(patch, (x, y))


def draw_brush(base, mark):
    points = mark.get("points") or []
    if len(points) < 2:
        return
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    xy = [(float(point.get("x", 0)), float(point.get("y", 0))) for point in points]
    draw.line(
        xy,
        fill=rgba(mark.get("color"), mark.get("opacity", 1)),
        width=max(1, int(round(float(mark.get("size", 1))))),
        joint="curve",
    )
    base.alpha_composite(overlay)


def draw_text(base, text_unit, font_path):
    text = str(text_unit.get("text") or "").strip()
    box = text_unit.get("box") or {}
    if not text:
        return

    x = int(round(float(box.get("x", 0))))
    y = int(round(float(box.get("y", 0))))
    width = int(round(float(box.get("width", 0))))
    height = int(round(float(box.get("height", 0))))
    if width <= 0 or height <= 0:
        return

    draw = ImageDraw.Draw(base)
    font, lines, line_height = fit_lines(draw, text, font_path, text_unit.get("fontSize", 18), width, height)
    if not lines:
        return

    text_color = text_rgba(text_unit.get("color"))
    total_height = line_height * len(lines)
    cursor_y = y + max(PADDING_Y, (height - total_height) / 2)
    for line in lines:
        shaped = shape_text(line)
        line_width, _ = text_bbox(draw, line, font)
        line_x = x + max(PADDING_X, (width - line_width) / 2)
        draw.text(
            (line_x, cursor_y),
            shaped,
            fill=text_color,
            font=font,
            stroke_width=1,
            stroke_fill=text_color,
        )
        cursor_y += line_height


def draw_composition(base, composition, font_path):
    text = composition_text(composition)
    box = composition.get("box") or {}
    style = composition.get("style") or {}
    layout = composition.get("layout") or {}
    if not text:
        return

    x = float(box.get("x", 0))
    y = float(box.get("y", 0))
    width = int(round(float(box.get("width", 0))))
    height = int(round(float(box.get("height", 0))))
    if width <= 0 or height <= 0:
        return

    stroke = composition_effect(composition, "stroke")
    shadow = composition_effect(composition, "shadow")
    background = composition_effect(composition, "background")
    stroke_width = composition_stroke_width(stroke)
    shadow_dx = float(shadow.get("x", 0)) if isinstance(shadow, dict) and shadow.get("enabled") else 0
    shadow_dy = float(shadow.get("y", 0)) if isinstance(shadow, dict) and shadow.get("enabled") else 0
    shadow_blur = max(0, float(shadow.get("blur", 0))) if isinstance(shadow, dict) and shadow.get("enabled") else 0
    margin = int(math.ceil(max(10, stroke_width + shadow_blur + abs(shadow_dx) + abs(shadow_dy) + 4)))

    layer = Image.new("RGBA", (width + margin * 2, height + margin * 2), (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer)
    local_x = margin
    local_y = margin

    if isinstance(background, dict) and background.get("enabled"):
        draw_rounded_rectangle(
            layer_draw,
            (local_x, local_y, local_x + width, local_y + height),
            max(0, float(background.get("radius") or 0)),
            rgba(background.get("color"), background.get("opacity", 1)),
        )

    font, lines, line_height = fit_composition_lines(
        layer_draw,
        text,
        font_path,
        style,
        layout,
        width,
        height,
        stroke_width,
    )
    if not lines:
        return

    padding_x = max(0, float(layout.get("paddingX", PADDING_X)))
    padding_y = max(0, float(layout.get("paddingY", PADDING_Y)))
    content_left = local_x + padding_x
    content_top = local_y + padding_y
    content_width = max(1, width - padding_x * 2)
    content_height = max(1, height - padding_y * 2)
    total_height = line_height * len(lines)
    vertical_align = str(layout.get("verticalAlign") or "middle")
    if vertical_align == "top":
        cursor_y = content_top
    elif vertical_align == "bottom":
        cursor_y = content_top + max(0, content_height - total_height)
    else:
        cursor_y = content_top + max(0, (content_height - total_height) / 2)

    align = str(layout.get("align") or "center")
    text_color = rgba(style.get("color") or DEFAULT_TEXT_COLOR, clamp(style.get("opacity", 1), 0, 1))
    stroke_fill = rgba(
        stroke.get("color") if isinstance(stroke, dict) else style.get("color"),
        stroke.get("opacity", 1) if isinstance(stroke, dict) else 1,
    ) if stroke_width > 0 else text_color

    shadow_layer = None
    shadow_draw = None
    if isinstance(shadow, dict) and shadow.get("enabled"):
        shadow_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_layer)

    line_positions = []
    for line in lines:
        line_width, _ = text_bbox(layer_draw, line, font, stroke_width)
        if align == "left":
            line_x = content_left
        elif align == "right":
            line_x = content_left + max(0, content_width - line_width)
        else:
            line_x = content_left + max(0, (content_width - line_width) / 2)
        line_positions.append((line, line_x, cursor_y))
        cursor_y += line_height

    if shadow_draw:
        shadow_color = rgba(shadow.get("color"), shadow.get("opacity", 1))
        for line, line_x, line_y in line_positions:
            shadow_draw.text(
                (line_x + shadow_dx, line_y + shadow_dy),
                shape_text(line),
                fill=shadow_color,
                font=font,
                stroke_width=stroke_width,
                stroke_fill=shadow_color,
            )
        if shadow_blur > 0:
            shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=shadow_blur))
        layer.alpha_composite(shadow_layer)

    for line, line_x, line_y in line_positions:
        layer_draw.text(
            (line_x, line_y),
            shape_text(line),
            fill=text_color,
            font=font,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )

    rotation = float(layout.get("rotation", 0) or 0)
    if rotation:
        rendered = layer.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
        center_x = x + width / 2
        center_y = y + height / 2
        paste_x = center_x - rendered.width / 2
        paste_y = center_y - rendered.height / 2
        alpha_composite_at(base, rendered, paste_x, paste_y)
    else:
        alpha_composite_at(base, layer, x - margin, y - margin)


def export_page(page, font_path, output_dir):
    base = Image.open(page["imagePath"]).convert("RGBA")
    for mark in page.get("marks", []):
        if mark.get("kind") == "clean_patch":
            paste_patch(base, mark)
        else:
            draw_brush(base, mark)
    for text_unit in page.get("textUnits", []):
        draw_text(base, text_unit, font_path)
    for composition in sorted(page.get("textCompositions", []), key=lambda item: item.get("renderOrder", 0)):
        draw_composition(base, composition, font_path)

    output_name = f"{int(page.get('index', 0)):04d}.png"
    output_path = output_dir / output_name
    base.convert("RGB").save(output_path, "PNG", optimize=True)
    return str(output_path)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: export-chapter-pages.py manifest.json")

    manifest_path = Path(sys.argv[1])
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output_dir = Path(manifest["outputDir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    font_path = manifest["fontPath"]

    exported = []
    for page in manifest.get("pages", []):
        exported.append(export_page(page, font_path, output_dir))

    print(json.dumps({"exported": exported}, ensure_ascii=False))


if __name__ == "__main__":
    main()
