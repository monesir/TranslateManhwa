import json
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def parse_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def box_from_args(args, offset):
    return {
        "x": parse_float(args[offset]),
        "y": parse_float(args[offset + 1]),
        "width": parse_float(args[offset + 2]),
        "height": parse_float(args[offset + 3]),
    }


def intersect(first, second):
    left = max(first["x"], second["x"])
    top = max(first["y"], second["y"])
    right = min(first["x"] + first["width"], second["x"] + second["width"])
    bottom = min(first["y"] + first["height"], second["y"] + second["height"])
    if right <= left or bottom <= top:
        return None
    return {
        "x": left,
        "y": top,
        "width": right - left,
        "height": bottom - top,
    }


def nonzero_alpha_pixels(alpha):
    histogram = alpha.histogram()
    return sum(histogram[1:])


def main():
    if len(sys.argv) < 11:
        raise SystemExit(
            "Usage: restore-clean-patch.py <patch_path> "
            "<restore_x> <restore_y> <restore_w> <restore_h> "
            "<patch_x> <patch_y> <patch_w> <patch_h> <feather>"
        )

    patch_path = sys.argv[1]
    restore_region = box_from_args(sys.argv, 2)
    patch_region = box_from_args(sys.argv, 6)
    feather = int(clamp(round(parse_float(sys.argv[10], 0)), 0, 12))

    if patch_region["width"] <= 0 or patch_region["height"] <= 0:
        raise SystemExit("Patch region has invalid dimensions")

    intersection = intersect(restore_region, patch_region)
    if intersection is None:
        print(json.dumps({"changedPixels": 0, "skipped": True, "reason": "no_intersection"}))
        return

    with Image.open(patch_path) as raw_image:
        image = raw_image.convert("RGBA")

    image_width, image_height = image.size
    left = int(clamp(round(((intersection["x"] - patch_region["x"]) / patch_region["width"]) * image_width), 0, image_width - 1))
    top = int(clamp(round(((intersection["y"] - patch_region["y"]) / patch_region["height"]) * image_height), 0, image_height - 1))
    right = int(clamp(round(((intersection["x"] + intersection["width"] - patch_region["x"]) / patch_region["width"]) * image_width), left + 1, image_width))
    bottom = int(clamp(round(((intersection["y"] + intersection["height"] - patch_region["y"]) / patch_region["height"]) * image_height), top + 1, image_height))

    alpha = image.getchannel("A")
    before_alpha = alpha.copy()
    before_nonzero = nonzero_alpha_pixels(before_alpha)

    restore_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(restore_mask).rectangle((left, top, right - 1, bottom - 1), fill=255)
    if feather > 0:
        restore_mask = restore_mask.filter(ImageFilter.GaussianBlur(feather))

    alpha = ImageChops.multiply(alpha, ImageChops.invert(restore_mask))
    image.putalpha(alpha)
    image.save(patch_path, "PNG")

    after_nonzero = nonzero_alpha_pixels(alpha)
    changed_pixels = nonzero_alpha_pixels(ImageChops.difference(before_alpha, alpha))

    print(json.dumps({
        "changedPixels": changed_pixels,
        "imageHeight": image_height,
        "imageWidth": image_width,
        "intersection": intersection,
        "pixelRegion": {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        },
        "remainingAlphaPixels": after_nonzero,
        "remainingAlphaRatio": after_nonzero / max(1, image_width * image_height),
        "restoredAlphaPixels": max(0, before_nonzero - after_nonzero),
        "skipped": changed_pixels == 0,
    }))


if __name__ == "__main__":
    main()
