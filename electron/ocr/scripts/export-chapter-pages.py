import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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


def text_bbox(draw, text, font):
    if not text:
        return 0, 0
    bbox = draw.textbbox((0, 0), shape_text(text), font=font, stroke_width=1)
    return max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])


def wrap_text(draw, text, font, max_width):
    paragraphs = [paragraph.strip() for paragraph in str(text or "").splitlines() if paragraph.strip()]
    if not paragraphs:
        return []

    def split_long_word(word):
        chunks = []
        current = ""
        for char in word:
            candidate = f"{current}{char}"
            width, _ = text_bbox(draw, candidate, font)
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
            width, _ = text_bbox(draw, candidate, font)
            if width <= max_width or not current:
                if not current and width > max_width:
                    lines.extend(split_long_word(word))
                    current = ""
                else:
                    current = candidate
            else:
                lines.append(current)
                word_width, _ = text_bbox(draw, word, font)
                if word_width > max_width:
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
    alpha = max(0, min(255, int(round(float(opacity or 1) * 255))))
    return red, green, blue, alpha


def text_rgba(color):
    return rgba(color or DEFAULT_TEXT_COLOR, 1)


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


def export_page(page, font_path, output_dir):
    base = Image.open(page["imagePath"]).convert("RGBA")
    for mark in page.get("marks", []):
        if mark.get("kind") == "clean_patch":
            paste_patch(base, mark)
        else:
            draw_brush(base, mark)
    for text_unit in page.get("textUnits", []):
        draw_text(base, text_unit, font_path)

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
