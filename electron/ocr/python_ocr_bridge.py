import argparse
import json
import sys


LANGUAGE_MAP = {
    "arabic": "ar",
    "ar": "ar",
    "chinese": "ch",
    "ch": "ch",
    "chinese_simplified": "ch",
    "chinese_traditional": "chinese_cht",
    "english": "en",
    "en": "en",
    "japanese": "japan",
    "ja": "japan",
    "japan": "japan",
    "korean": "korean",
    "ko": "korean",
}

EASYOCR_LANGUAGE_MAP = {
    "arabic": "ar",
    "ar": "ar",
    "chinese": "ch_sim",
    "ch": "ch_sim",
    "chinese_simplified": "ch_sim",
    "chinese_traditional": "ch_tra",
    "english": "en",
    "en": "en",
    "japanese": "ja",
    "ja": "ja",
    "japan": "ja",
    "korean": "ko",
    "ko": "ko",
}


def normalize_language(value, mapping, fallback):
    key = (value or "").strip().lower().replace("-", "_")
    return mapping.get(key, fallback)


def bbox_from_polygon(points, fallback_width, fallback_height):
    if not points:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    min_x = max(0.0, min(xs))
    min_y = max(0.0, min(ys))
    max_x = max(min_x + 1.0, max(xs))
    max_y = max(min_y + 1.0, max(ys))
    return {
        "type": "box",
        "x": round(min_x, 2),
        "y": round(min_y, 2),
        "width": round(max_x - min_x, 2),
        "height": round(max_y - min_y, 2),
    }


def normalize_paddle_result(raw_result, fallback_width, fallback_height):
    items = []
    pages = raw_result if isinstance(raw_result, list) else [raw_result]
    for page in pages:
        if page is None:
            continue
        entries = page
        if isinstance(page, dict):
            entries = page.get("rec_texts") or page.get("data") or []
        for entry in entries:
            text = ""
            confidence = None
            polygon = []
            if isinstance(entry, dict):
                text = str(entry.get("text") or entry.get("rec_text") or "").strip()
                confidence = entry.get("confidence") or entry.get("score") or entry.get("rec_score")
                polygon = entry.get("points") or entry.get("box") or []
            elif isinstance(entry, (list, tuple)) and len(entry) >= 2:
                polygon = entry[0] or []
                value = entry[1]
                if isinstance(value, (list, tuple)) and len(value) >= 2:
                    text = str(value[0]).strip()
                    confidence = value[1]
                else:
                    text = str(value).strip()
            if not text:
                continue
            try:
                normalized_confidence = float(confidence)
            except Exception:
                normalized_confidence = None
            items.append(
                {
                    "text": text,
                    "confidence": normalized_confidence,
                    "region": bbox_from_polygon(polygon, fallback_width, fallback_height),
                }
            )
    return items


def run_paddle(args):
    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        raise RuntimeError("PaddleOCR is not installed. Install it with: pip install paddleocr") from exc

    language = normalize_language(args.language, LANGUAGE_MAP, "en")
    try:
        ocr = PaddleOCR(use_angle_cls=True, lang=language, show_log=False)
    except TypeError:
        ocr = PaddleOCR(lang=language)

    try:
        result = ocr.ocr(args.image, cls=True)
    except TypeError:
        result = ocr.ocr(args.image)
    return normalize_paddle_result(result, args.page_width, args.page_height)


def run_easyocr(args):
    try:
        import easyocr
    except Exception as exc:
        raise RuntimeError("EasyOCR is not installed. Install it with: pip install easyocr") from exc

    language = normalize_language(args.language, EASYOCR_LANGUAGE_MAP, "en")
    reader = easyocr.Reader([language], gpu=False)
    result = reader.readtext(args.image)
    items = []
    for polygon, text, confidence in result:
        text = str(text).strip()
        if not text:
            continue
        items.append(
            {
                "text": text,
                "confidence": float(confidence),
                "region": bbox_from_polygon(polygon, args.page_width, args.page_height),
            }
        )
    return items


def run_manga_ocr(args):
    try:
        from manga_ocr import MangaOcr
    except Exception as exc:
        raise RuntimeError("Manga OCR is not installed. Install it with: pip install manga-ocr") from exc

    text = str(MangaOcr()(args.image)).strip()
    if not text:
        return []
    return [
        {
            "text": text,
            "confidence": None,
            "region": {"type": "box", "x": 0, "y": 0, "width": args.page_width, "height": args.page_height},
        }
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, choices=["paddleocr", "easyocr", "manga-ocr"])
    parser.add_argument("--image", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--page-width", type=float, default=820)
    parser.add_argument("--page-height", type=float, default=1240)
    args = parser.parse_args()

    if args.provider == "paddleocr":
        items = run_paddle(args)
    elif args.provider == "easyocr":
        items = run_easyocr(args)
    else:
        items = run_manga_ocr(args)

    print(json.dumps({"items": items}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
