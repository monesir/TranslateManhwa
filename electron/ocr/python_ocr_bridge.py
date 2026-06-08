import argparse
import contextlib
import json
import os
import sys

os.environ.setdefault("FLAGS_use_onednn", "0")
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("PADDLE_DISABLE_MKLDNN", "1")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


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
    if points is None:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}
    try:
        normalized_points = list(points)
    except Exception:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}
    if len(normalized_points) == 0:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}
    xs = [float(point[0]) for point in normalized_points]
    ys = [float(point[1]) for point in normalized_points]
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
            rec_texts = page.get("rec_texts")
            if rec_texts is not None:
                rec_scores = page.get("rec_scores")
                rec_polys = page.get("rec_polys")
                if rec_polys is None:
                    rec_polys = page.get("dt_polys")
                if rec_polys is None:
                    rec_polys = page.get("rec_boxes")
                score_values = list(rec_scores) if rec_scores is not None else []
                polygon_values = list(rec_polys) if rec_polys is not None else []
                for index, text in enumerate(list(rec_texts)):
                    text = str(text).strip()
                    if not text:
                        continue
                    try:
                        confidence = float(score_values[index])
                    except Exception:
                        confidence = None
                    try:
                        polygon = polygon_values[index]
                    except Exception:
                        polygon = []
                    items.append(
                        {
                            "text": text,
                            "confidence": confidence,
                            "region": bbox_from_polygon(polygon, fallback_width, fallback_height),
                        }
                    )
                continue
            entries = page.get("data") or []
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


def normalize_rapidocr_result(raw_result, fallback_width, fallback_height):
    items = []

    if isinstance(raw_result, tuple) and raw_result:
        raw_result = raw_result[0]

    boxes = getattr(raw_result, "boxes", None)
    texts = getattr(raw_result, "txts", None)
    scores = getattr(raw_result, "scores", None)
    if boxes is not None and texts is not None:
        box_values = list(boxes)
        text_values = list(texts)
        score_values = list(scores) if scores is not None else []
        for index, text in enumerate(text_values):
            text = str(text).strip()
            if not text:
                continue
            score = None
            try:
                score = float(score_values[index])
            except Exception:
                score = None
            items.append(
                {
                    "text": text,
                    "confidence": score,
                    "region": bbox_from_polygon(box_values[index], fallback_width, fallback_height),
                }
            )
        return items

    entries = raw_result or []
    for entry in entries:
        text = ""
        confidence = None
        polygon = []
        if isinstance(entry, dict):
            text = str(entry.get("text") or entry.get("rec_text") or "").strip()
            confidence = entry.get("confidence") or entry.get("score") or entry.get("rec_score")
            polygon = entry.get("points") or entry.get("box") or entry.get("dt_box") or []
        elif isinstance(entry, (list, tuple)) and len(entry) >= 3:
            polygon = entry[0] or []
            text = str(entry[1]).strip()
            confidence = entry[2]
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


def normalized_geometry_to_box(geometry, fallback_width, fallback_height):
    if not geometry:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}

    points = []
    for point in geometry:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            points.append((float(point[0]), float(point[1])))
    if not points:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}

    max_value = max(max(abs(x), abs(y)) for x, y in points)
    if max_value <= 1.5:
        points = [(x * fallback_width, y * fallback_height) for x, y in points]

    return bbox_from_polygon(points, fallback_width, fallback_height)


def merge_doctr_geometries(geometries, fallback_width, fallback_height):
    boxes = [normalized_geometry_to_box(geometry, fallback_width, fallback_height) for geometry in geometries if geometry]
    if not boxes:
        return {"type": "box", "x": 0, "y": 0, "width": fallback_width, "height": fallback_height}

    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    return {
        "type": "box",
        "x": round(left, 2),
        "y": round(top, 2),
        "width": round(max(1.0, right - left), 2),
        "height": round(max(1.0, bottom - top), 2),
    }


def run_paddle(args):
    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        raise RuntimeError("PaddleOCR is not installed. Install it with: pip install paddleocr") from exc

    language = normalize_language(args.language, LANGUAGE_MAP, "en")
    last_error = None
    ocr = None
    for kwargs in (
        {"use_textline_orientation": True, "lang": language},
        {"use_angle_cls": True, "lang": language},
        {"lang": language},
    ):
        try:
            ocr = PaddleOCR(**kwargs)
            break
        except Exception as exc:
            last_error = exc
    if ocr is None:
        raise RuntimeError(f"PaddleOCR failed to initialize: {last_error}")

    if hasattr(ocr, "predict"):
        result = ocr.predict(args.image)
    else:
        try:
            result = ocr.ocr(args.image, cls=True)
        except TypeError:
            result = ocr.ocr(args.image)
    return normalize_paddle_result(result, args.page_width, args.page_height)


def run_rapidocr(args):
    try:
        from rapidocr import RapidOCR
    except Exception:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except Exception as exc:
            raise RuntimeError("RapidOCR is not installed. Install it with: pip install rapidocr") from exc

    engine = RapidOCR()
    result = engine(args.image)
    return normalize_rapidocr_result(result, args.page_width, args.page_height)


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


def run_doctr(args):
    try:
        from doctr.io import DocumentFile
        from doctr.models import ocr_predictor
    except Exception as exc:
        raise RuntimeError('docTR is not installed. Install it with: pip install "python-doctr[torch]"') from exc

    document = DocumentFile.from_images(args.image)
    try:
        model = ocr_predictor(pretrained=True, export_as_straight_boxes=True)
    except TypeError:
        model = ocr_predictor(pretrained=True)
    result = model(document).export()
    items = []

    for page in result.get("pages", []):
        for block in page.get("blocks", []):
            for line in block.get("lines", []):
                words = line.get("words", [])
                text = " ".join(str(word.get("value", "")).strip() for word in words).strip()
                if not text:
                    continue

                confidences = []
                geometries = []
                for word in words:
                    try:
                        confidences.append(float(word.get("confidence")))
                    except Exception:
                        pass
                    if word.get("geometry"):
                        geometries.append(word.get("geometry"))

                confidence = sum(confidences) / len(confidences) if confidences else None
                region = (
                    merge_doctr_geometries(geometries, args.page_width, args.page_height)
                    if geometries
                    else normalized_geometry_to_box(line.get("geometry"), args.page_width, args.page_height)
                )
                items.append({"text": text, "confidence": confidence, "region": region})

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
    parser.add_argument(
        "--provider",
        required=True,
        choices=["paddleocr", "easyocr", "rapidocr", "doctr", "manga-ocr"],
    )
    parser.add_argument("--image", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--page-width", type=float, default=820)
    parser.add_argument("--page-height", type=float, default=1240)
    args = parser.parse_args()

    with contextlib.redirect_stdout(sys.stderr):
        if args.provider == "paddleocr":
            items = run_paddle(args)
        elif args.provider == "easyocr":
            items = run_easyocr(args)
        elif args.provider == "rapidocr":
            items = run_rapidocr(args)
        elif args.provider == "doctr":
            items = run_doctr(args)
        else:
            items = run_manga_ocr(args)

    print(json.dumps({"items": items}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
