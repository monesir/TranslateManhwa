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

    with open(patches_manifest_path, "r", encoding="utf-8") as manifest_file:
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
    if len(sys.argv) not in (12, 13):
        raise SystemExit(
            "Usage: smart-clean-text.py <source> <output> <x> <y> <width> <height> "
            "<page_width> <page_height> <mask_expansion> <feather> <method> [patches_manifest]"
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
    mask = build_text_mask(crop_rgb, expansion)

    if int(np.count_nonzero(mask)) == 0:
        raise RuntimeError("No text-like pixels were found inside the selected region")

    inpaint_method = cv2.INPAINT_NS if method == "ns" else cv2.INPAINT_TELEA
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
