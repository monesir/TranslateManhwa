import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def odd_kernel(value):
    value = max(3, int(value))
    return value if value % 2 == 1 else value + 1


def filter_text_components(mask, crop_width, crop_height):
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    filtered = np.zeros_like(mask)
    crop_area = max(1, crop_width * crop_height)

    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if area < 3:
            continue

        box_area = max(1, width * height)
        density = area / box_area
        touches_edge = (
            x <= 1
            or y <= 1
            or x + width >= crop_width - 1
            or y + height >= crop_height - 1
        )

        if area > crop_area * 0.32 and density < 0.22:
            continue
        if width > crop_width * 0.92 and height > crop_height * 0.12 and (touches_edge or density < 0.2):
            continue
        if width > crop_width * 0.55 and height > crop_height * 0.35 and density < 0.18:
            continue
        if height > crop_height * 0.8 and width > crop_width * 0.18 and (touches_edge or density < 0.2):
            continue
        filtered[labels == label] = 255

    return filtered


def guarded_mask(mask, crop_width, crop_height):
    guarded = mask.copy()
    guard = int(clamp(round(min(crop_width, crop_height) * 0.035), 3, 24))
    guarded[:guard, :] = 0
    guarded[-guard:, :] = 0
    guarded[:, :guard] = 0
    guarded[:, -guard:] = 0
    return guarded


def feature_mask(gray, polarity):
    crop_height, crop_width = gray.shape[:2]
    blur_size = odd_kernel(max(11, min(crop_width, crop_height) // 8))
    local_background = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
    feature_kernel_size = odd_kernel(int(clamp(min(crop_width, crop_height) // 9, 9, 35)))
    feature_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (feature_kernel_size, feature_kernel_size))

    if polarity == "light":
        contrast = cv2.subtract(gray, local_background)
        adaptive = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            odd_kernel(max(21, min(crop_width, crop_height) // 5)),
            -6,
        )
        top_hat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, feature_kernel)
        contrast_mask = ((gray > 45) & (contrast > 9)).astype(np.uint8) * 255
    else:
        contrast = cv2.subtract(local_background, gray)
        adaptive = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            odd_kernel(max(21, min(crop_width, crop_height) // 5)),
            11,
        )
        top_hat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, feature_kernel)
        contrast_mask = ((gray < 220) & (contrast > 9)).astype(np.uint8) * 255

    _threshold, feature = cv2.threshold(top_hat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.bitwise_or(cv2.bitwise_and(adaptive, contrast_mask), feature)
    mask = guarded_mask(mask, crop_width, crop_height)
    mask = filter_text_components(mask, crop_width, crop_height)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8), iterations=1)
    return mask


def build_text_mask(crop_rgb, expansion):
    crop_height, crop_width = crop_rgb.shape[:2]
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)

    dark_mask = feature_mask(gray, "dark")
    light_mask = feature_mask(gray, "light")
    mask = cv2.bitwise_or(dark_mask, light_mask)

    if expansion > 0:
        kernel_size = max(1, int(expansion) * 2 + 1)
        mask = cv2.dilate(mask, np.ones((kernel_size, kernel_size), np.uint8), iterations=1)

    return mask


def crop_mask_from_page_region(mask_region, image_width, image_height, page_width, page_height, crop_bounds):
    if not mask_region:
        return None

    mask_left, mask_top, mask_right, mask_bottom = page_region_to_pixels(
        mask_region,
        image_width,
        image_height,
        page_width,
        page_height,
    )
    crop_left, crop_top, crop_right, crop_bottom = crop_bounds
    left = int(clamp(mask_left - crop_left, 0, crop_right - crop_left))
    top = int(clamp(mask_top - crop_top, 0, crop_bottom - crop_top))
    right = int(clamp(mask_right - crop_left, left + 1, crop_right - crop_left))
    bottom = int(clamp(mask_bottom - crop_top, top + 1, crop_bottom - crop_top))

    limit = np.zeros((crop_bottom - crop_top, crop_right - crop_left), dtype=np.uint8)
    limit[top:bottom, left:right] = 255
    return limit


def expand_binary_mask(mask, pixels):
    if mask is None:
        return None
    pixels = int(max(0, pixels))
    if pixels <= 0:
        return mask
    kernel_size = pixels * 2 + 1
    return cv2.dilate(mask, np.ones((kernel_size, kernel_size), np.uint8), iterations=1)


def masked_values(values, mask):
    selected = values[mask > 0]
    if selected.size == 0:
        return values.reshape(-1)
    return selected.reshape(-1)


def classify_crop(crop_rgb, mask):
    crop_height, crop_width = crop_rgb.shape[:2]
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2HSV)
    text_guard = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)
    background_mask = cv2.bitwise_not(text_guard)
    guard = int(clamp(round(min(crop_width, crop_height) * 0.025), 2, 18))
    background_mask[:guard, :] = 0
    background_mask[-guard:, :] = 0
    background_mask[:, :guard] = 0
    background_mask[:, -guard:] = 0

    if int(np.count_nonzero(background_mask)) < max(20, crop_width * crop_height * 0.08):
        background_mask = cv2.bitwise_not(text_guard)

    gray_values = masked_values(gray, background_mask)
    saturation_values = masked_values(hsv[:, :, 1], background_mask)
    edges = cv2.Canny(gray, 60, 160)
    non_text_edges = cv2.bitwise_and(edges, background_mask)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    laplacian_values = np.abs(laplacian)[background_mask > 0]

    crop_area = max(1, crop_width * crop_height)
    mean_luma = float(np.mean(gray_values))
    luma_std = float(np.std(gray_values))
    mean_saturation = float(np.mean(saturation_values))
    saturation_std = float(np.std(saturation_values))
    edge_density = float(np.count_nonzero(non_text_edges)) / crop_area
    texture_score = float(clamp((np.var(laplacian_values) if laplacian_values.size else 0.0) / 1800.0, 0, 1))
    text_mask_ratio = float(np.count_nonzero(mask)) / crop_area
    text_pixels = masked_values(gray, mask)
    text_contrast = float(abs(float(np.mean(text_pixels)) - mean_luma)) if text_pixels.size else 0.0

    metrics = {
        "meanLuma": round(mean_luma, 4),
        "lumaStd": round(luma_std, 4),
        "meanSaturation": round(mean_saturation, 4),
        "saturationStd": round(saturation_std, 4),
        "edgeDensity": round(edge_density, 6),
        "textureScore": round(texture_score, 6),
        "textMaskRatio": round(text_mask_ratio, 6),
        "textContrast": round(text_contrast, 4),
    }

    if text_mask_ratio > 0.42 or edge_density > 0.24 or texture_score > 0.42:
        return {
            "kind": "unsafe",
            "confidence": 0.86,
            "metrics": metrics,
            "reason": "Region contains too much text-like or textured detail.",
        }

    if mean_luma >= 205 and luma_std <= 24 and mean_saturation <= 45 and edge_density <= 0.09 and texture_score <= 0.16:
        confidence = 0.72 + min(0.24, (mean_luma - 205) / 220 + (24 - luma_std) / 180)
        return {
            "kind": "white_bubble",
            "confidence": round(float(clamp(confidence, 0.72, 0.96)), 4),
            "metrics": metrics,
            "reason": "Light low-texture background.",
        }

    if mean_luma <= 55 and luma_std <= 28 and edge_density <= 0.11 and texture_score <= 0.18:
        confidence = 0.72 + min(0.23, (55 - mean_luma) / 160 + (28 - luma_std) / 190)
        return {
            "kind": "black_bubble",
            "confidence": round(float(clamp(confidence, 0.72, 0.95)), 4),
            "metrics": metrics,
            "reason": "Dark low-texture background.",
        }

    if mean_luma >= 175 and luma_std <= 32 and edge_density <= 0.11 and texture_score <= 0.20:
        return {
            "kind": "flat_light_box",
            "confidence": 0.74,
            "metrics": metrics,
            "reason": "Flat light background.",
        }

    if mean_luma <= 85 and luma_std <= 34 and edge_density <= 0.12 and texture_score <= 0.22:
        return {
            "kind": "flat_dark_box",
            "confidence": 0.73,
            "metrics": metrics,
            "reason": "Flat dark background.",
        }

    if luma_std > 36 or edge_density > 0.14 or texture_score > 0.24:
        return {
            "kind": "textured_background",
            "confidence": 0.82,
            "metrics": metrics,
            "reason": "Background has strong texture or non-text edges.",
        }

    return {
        "kind": "unknown",
        "confidence": 0.55,
        "metrics": metrics,
        "reason": "Background did not meet safe bubble thresholds.",
    }


def bubble_fill(crop_rgb, mask):
    crop_height, crop_width = crop_rgb.shape[:2]
    text_guard = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)
    background_mask = cv2.bitwise_not(text_guard)
    if int(np.count_nonzero(background_mask)) < max(20, crop_width * crop_height * 0.08):
        background_mask = cv2.bitwise_not(mask)

    pixels = crop_rgb[background_mask > 0]
    if pixels.size == 0:
        fill_color = np.array([255, 255, 255], dtype=np.uint8)
    else:
        fill_color = np.median(pixels, axis=0).astype(np.uint8)

    filled = crop_rgb.copy()
    filled[mask > 0] = fill_color
    return filled, [int(fill_color[0]), int(fill_color[1]), int(fill_color[2])]


def build_free_text_mask(crop_rgb, base_mask, expansion):
    crop_height, crop_width = crop_rgb.shape[:2]
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2HSV)
    mask = base_mask.copy()

    near_kernel_size = odd_kernel(int(clamp(expansion * 2 + 9, 9, 31)))
    near_text = cv2.dilate(mask, np.ones((near_kernel_size, near_kernel_size), np.uint8), iterations=1)

    background_blur = cv2.GaussianBlur(
        gray,
        (odd_kernel(max(17, min(crop_width, crop_height) // 5)), odd_kernel(max(17, min(crop_width, crop_height) // 5))),
        0,
    )
    contrast = cv2.absdiff(gray, background_blur)
    contrast_mask = ((contrast > 16) & (near_text > 0)).astype(np.uint8) * 255

    saturation = hsv[:, :, 1]
    saturation_blur = cv2.GaussianBlur(saturation, (odd_kernel(max(17, min(crop_width, crop_height) // 5)),) * 2, 0)
    saturation_delta = cv2.absdiff(saturation, saturation_blur)
    color_mask = ((saturation_delta > 32) & (near_text > 0)).astype(np.uint8) * 255

    edges = cv2.Canny(gray, 45, 145)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8), iterations=1)
    edge_mask = cv2.bitwise_and(edges, near_text)

    mask = cv2.bitwise_or(mask, contrast_mask)
    mask = cv2.bitwise_or(mask, color_mask)
    mask = cv2.bitwise_or(mask, edge_mask)
    mask = guarded_mask(mask, crop_width, crop_height)
    mask = filter_text_components(mask, crop_width, crop_height)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)

    extra_expansion = int(clamp(round(expansion / 2) + 1, 1, 6))
    mask = cv2.dilate(mask, np.ones((extra_expansion * 2 + 1, extra_expansion * 2 + 1), np.uint8), iterations=1)
    return mask


def inpaint_bgr(image_bgr, mask, radius, method):
    return cv2.inpaint(image_bgr, mask, float(radius), method)


def free_text_inpaint(crop_rgb, base_mask, method, expansion, mask_limit=None):
    crop_height, crop_width = crop_rgb.shape[:2]
    mask = build_free_text_mask(crop_rgb, base_mask, expansion)
    if mask_limit is not None:
        mask = cv2.bitwise_and(mask, expand_binary_mask(mask_limit, max(4, expansion + 3)))
    image_bgr = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR)
    radius = float(clamp(expansion + 4, 4, 14))

    telea = inpaint_bgr(image_bgr, mask, radius, cv2.INPAINT_TELEA)
    navier_stokes = inpaint_bgr(image_bgr, mask, radius, cv2.INPAINT_NS)
    preferred = navier_stokes if method == "ns" else telea
    alternate = telea if method == "ns" else navier_stokes
    blended = cv2.addWeighted(preferred, 0.62, alternate, 0.38, 0)

    if min(crop_width, crop_height) >= 80:
      small_width = max(1, crop_width // 2)
      small_height = max(1, crop_height // 2)
      small_image = cv2.resize(image_bgr, (small_width, small_height), interpolation=cv2.INTER_AREA)
      small_mask = cv2.resize(mask, (small_width, small_height), interpolation=cv2.INTER_NEAREST)
      small_radius = float(clamp(radius / 2, 2, 8))
      coarse = cv2.inpaint(small_image, small_mask, small_radius, cv2.INPAINT_TELEA)
      coarse = cv2.resize(coarse, (crop_width, crop_height), interpolation=cv2.INTER_CUBIC)
      blended = cv2.addWeighted(blended, 0.78, coarse, 0.22, 0)

    # Light texture restoration keeps the inpainted area from becoming a flat smear.
    blurred = cv2.GaussianBlur(blended, (0, 0), 1.2)
    sharpened = cv2.addWeighted(blended, 1.35, blurred, -0.35, 0)
    output_bgr = cv2.addWeighted(sharpened, 0.82, blended, 0.18, 0)

    return cv2.cvtColor(output_bgr, cv2.COLOR_BGR2RGB), mask, {
        "model": "local-free-text-inpaint-v1",
        "radius": radius,
        "maskPixelsBefore": int(np.count_nonzero(base_mask)),
        "maskPixelsAfter": int(np.count_nonzero(mask)),
    }


_LAMA_MODEL = None


def lama_inpaint(crop_rgb, base_mask, expansion, mask_limit=None):
    global _LAMA_MODEL

    try:
        from simple_lama_inpainting.models.model import SimpleLama
    except Exception as error:
        raise RuntimeError(
            "LaMa provider requires simple-lama-inpainting. "
            "Install it in .venv-lama or set FLORIS_LAMA_PYTHON to a Python environment that has it."
        ) from error

    crop_height, crop_width = crop_rgb.shape[:2]
    mask = build_free_text_mask(crop_rgb, base_mask, max(expansion, 4))
    if mask_limit is not None:
        mask = cv2.bitwise_and(mask, expand_binary_mask(mask_limit, max(6, expansion + 4)))

    if _LAMA_MODEL is None:
        _LAMA_MODEL = SimpleLama()

    image = Image.fromarray(crop_rgb, "RGB")
    mask_image = Image.fromarray(mask, "L")
    result = _LAMA_MODEL(image, mask_image)
    if not isinstance(result, Image.Image):
        result = Image.fromarray(np.asarray(result))

    result = result.convert("RGB")
    if result.size != (crop_width, crop_height):
        result = result.crop((0, 0, crop_width, crop_height))

    return np.array(result), mask, {
        "model": "simple-lama-inpainting",
        "maskPixelsBefore": int(np.count_nonzero(base_mask)),
        "maskPixelsAfter": int(np.count_nonzero(mask)),
        "modelInputSize": {"width": crop_width, "height": crop_height},
    }


def page_region_to_pixels(region, image_width, image_height, page_width, page_height):
    left = int(clamp(round((float(region["x"]) / page_width) * image_width), 0, image_width - 1))
    top = int(clamp(round((float(region["y"]) / page_height) * image_height), 0, image_height - 1))
    right = int(
        clamp(round(((float(region["x"]) + float(region["width"])) / page_width) * image_width), left + 1, image_width)
    )
    bottom = int(
        clamp(round(((float(region["y"]) + float(region["height"])) / page_height) * image_height), top + 1, image_height)
    )
    return left, top, right, bottom


def apply_existing_patches(image, patches_manifest_path, page_width, page_height):
    if not patches_manifest_path:
        return image
    if not os.path.exists(patches_manifest_path):
        return image

    with open(patches_manifest_path, "r", encoding="utf-8-sig") as manifest_file:
        patches = json.load(manifest_file)

    if not isinstance(patches, list) or len(patches) == 0:
        return image

    image_width, image_height = image.size
    canvas = image.convert("RGBA")

    for patch in patches:
        patch_path = patch.get("path")
        region = patch.get("region")
        if not patch_path or not region or not os.path.exists(patch_path):
            continue

        left, top, right, bottom = page_region_to_pixels(region, image_width, image_height, page_width, page_height)
        patch_width = max(1, right - left)
        patch_height = max(1, bottom - top)

        with Image.open(patch_path) as raw_patch:
            patch_image = ImageOps.exif_transpose(raw_patch).convert("RGBA")
            if patch_image.size != (patch_width, patch_height):
                patch_image = patch_image.resize((patch_width, patch_height), Image.Resampling.LANCZOS)
            canvas.alpha_composite(patch_image, (left, top))

    return canvas.convert("RGB")


def main():
    if len(sys.argv) not in (12, 13, 14, 15, 19):
        raise SystemExit(
            "Usage: smart-clean-text.py <source> <output> <x> <y> <width> <height> "
            "<page_width> <page_height> <mask_expansion> <feather> <method> [patches_manifest] [provider] [policy] "
            "[mask_x mask_y mask_width mask_height]"
        )

    source_path = sys.argv[1]
    output_path = sys.argv[2]
    x = float(sys.argv[3])
    y = float(sys.argv[4])
    region_width = float(sys.argv[5])
    region_height = float(sys.argv[6])
    page_width = max(1.0, float(sys.argv[7]))
    page_height = max(1.0, float(sys.argv[8]))
    expansion = int(clamp(round(float(sys.argv[9])), 0, 18))
    feather = int(clamp(round(float(sys.argv[10])), 0, 16))
    method = sys.argv[11].strip().lower()
    patches_manifest_path = sys.argv[12] if len(sys.argv) == 13 else ""
    if len(sys.argv) >= 14:
        patches_manifest_path = sys.argv[12]
    provider = sys.argv[13].strip().lower() if len(sys.argv) >= 14 else ""
    if provider == "":
        provider = "opencv_ns" if method == "ns" else "opencv_telea"
    mask_region = None
    if len(sys.argv) >= 19 and all(part.strip() for part in sys.argv[15:19]):
        mask_region = {
            "x": float(sys.argv[15]),
            "y": float(sys.argv[16]),
            "width": float(sys.argv[17]),
            "height": float(sys.argv[18]),
        }

    with Image.open(source_path) as raw_image:
        image = ImageOps.exif_transpose(raw_image).convert("RGB")

    image_width, image_height = image.size
    image = apply_existing_patches(image, patches_manifest_path, page_width, page_height)
    left, top, right, bottom = page_region_to_pixels(
        {"x": x, "y": y, "width": region_width, "height": region_height},
        image_width,
        image_height,
        page_width,
        page_height,
    )

    crop = image.crop((left, top, right, bottom))
    crop_rgb = np.array(crop)
    crop_height, crop_width = crop_rgb.shape[:2]
    mask_limit = crop_mask_from_page_region(
        mask_region,
        image_width,
        image_height,
        page_width,
        page_height,
        (left, top, right, bottom),
    )
    mask = build_text_mask(crop_rgb, expansion)
    if mask_limit is not None:
        mask = cv2.bitwise_and(mask, mask_limit)
    classification = classify_crop(crop_rgb, mask)

    if int(np.count_nonzero(mask)) == 0:
        raise RuntimeError("No text-like pixels were found inside the selected region")

    if provider == "classify":
        print(json.dumps({"classification": classification}, ensure_ascii=True))
        return

    metadata = {
        "classification": classification,
        "provider": provider,
    }
    if mask_region is not None:
        metadata["maskRegion"] = mask_region

    if provider == "bubble_fill":
        inpainted_rgb, fill_color = bubble_fill(crop_rgb, mask)
        metadata["fillColor"] = fill_color
    elif provider == "free_text_inpaint":
        inpainted_rgb, mask, free_text_metadata = free_text_inpaint(crop_rgb, mask, method, expansion, mask_limit)
        metadata.update(free_text_metadata)
    elif provider == "lama":
        inpainted_rgb, mask, lama_metadata = lama_inpaint(crop_rgb, mask, expansion, mask_limit)
        metadata.update(lama_metadata)
    else:
        inpaint_method = cv2.INPAINT_NS if method == "ns" or provider == "opencv_ns" else cv2.INPAINT_TELEA
        radius = float(clamp(expansion + 2, 3, 12))
        inpainted_bgr = cv2.inpaint(cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR), mask, radius, inpaint_method)
        inpainted_rgb = cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB)

    alpha = mask
    if feather > 0:
        alpha = cv2.GaussianBlur(alpha, (odd_kernel(feather * 2 + 1), odd_kernel(feather * 2 + 1)), 0)

    rgba = np.dstack([inpainted_rgb, alpha])
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output_path)

    print(
        json.dumps(
            {
                **metadata,
                "maskPixels": int(np.count_nonzero(mask)),
                "pixelRegion": {
                    "x": left,
                    "y": top,
                    "width": crop_width,
                    "height": crop_height,
                },
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
