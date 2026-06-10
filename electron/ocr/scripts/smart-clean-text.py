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
        if area > crop_area * 0.16:
            continue
        if width > crop_width * 0.92 and height > crop_height * 0.12:
            continue
        if width > crop_width * 0.55 and height > crop_height * 0.35:
            continue
        if height > crop_height * 0.8 and width > crop_width * 0.18:
            continue
        filtered[labels == label] = 255

    return filtered


def build_text_mask(crop_rgb, expansion):
    crop_height, crop_width = crop_rgb.shape[:2]
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)

    blur_size = odd_kernel(max(11, min(crop_width, crop_height) // 8))
    local_background = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
    dark_contrast = cv2.subtract(local_background, gray)

    dark_mask = ((gray < 205) & (dark_contrast > 10)).astype(np.uint8) * 255
    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        odd_kernel(max(21, min(crop_width, crop_height) // 5)),
        11,
    )
    mask = cv2.bitwise_and(adaptive, dark_mask)

    # Keep bubble borders and panel lines if the user selected a whole bubble.
    guard = int(clamp(round(min(crop_width, crop_height) * 0.035), 3, 24))
    mask[:guard, :] = 0
    mask[-guard:, :] = 0
    mask[:, :guard] = 0
    mask[:, -guard:] = 0

    mask = filter_text_components(mask, crop_width, crop_height)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8), iterations=1)

    if expansion > 0:
        kernel_size = max(1, int(expansion) * 2 + 1)
        mask = cv2.dilate(mask, np.ones((kernel_size, kernel_size), np.uint8), iterations=1)

    return mask


def main():
    if len(sys.argv) != 12:
        raise SystemExit(
            "Usage: smart-clean-text.py <source> <output> <x> <y> <width> <height> "
            "<page_width> <page_height> <mask_expansion> <feather> <method>"
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

    with Image.open(source_path) as raw_image:
        image = ImageOps.exif_transpose(raw_image).convert("RGB")

    image_width, image_height = image.size
    left = int(clamp(round((x / page_width) * image_width), 0, image_width - 1))
    top = int(clamp(round((y / page_height) * image_height), 0, image_height - 1))
    right = int(clamp(round(((x + region_width) / page_width) * image_width), left + 1, image_width))
    bottom = int(clamp(round(((y + region_height) / page_height) * image_height), top + 1, image_height))

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
