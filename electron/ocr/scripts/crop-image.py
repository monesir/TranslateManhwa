import argparse
import os

from PIL import Image, ImageOps


def clamp(value, minimum, maximum):
    return max(minimum, min(value, maximum))


def main():
    parser = argparse.ArgumentParser(description="Crop an OCR page region into a PNG image.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--x", required=True, type=int)
    parser.add_argument("--y", required=True, type=int)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    args = parser.parse_args()

    source_path = os.path.abspath(args.source)
    output_path = os.path.abspath(args.output)

    with Image.open(source_path) as source:
        image = ImageOps.exif_transpose(source)
        safe_x = clamp(args.x, 0, max(0, image.width - 1))
        safe_y = clamp(args.y, 0, max(0, image.height - 1))
        safe_width = max(1, min(args.width, image.width - safe_x))
        safe_height = max(1, min(args.height, image.height - safe_y))
        cropped = image.crop((safe_x, safe_y, safe_x + safe_width, safe_y + safe_height))

        if cropped.mode not in ("RGB", "RGBA"):
            has_alpha = "A" in cropped.getbands() or "transparency" in cropped.info
            cropped = cropped.convert("RGBA" if has_alpha else "RGB")

        output_directory = os.path.dirname(output_path)
        if output_directory:
            os.makedirs(output_directory, exist_ok=True)
        cropped.save(output_path, "PNG")


if __name__ == "__main__":
    main()
