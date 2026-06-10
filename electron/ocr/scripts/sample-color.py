import json
import sys

from PIL import Image, ImageOps


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def main():
    if len(sys.argv) != 6:
        raise SystemExit("Usage: sample-color.py <image_path> <x> <y> <page_width> <page_height>")

    image_path = sys.argv[1]
    x = float(sys.argv[2])
    y = float(sys.argv[3])
    page_width = max(1.0, float(sys.argv[4]))
    page_height = max(1.0, float(sys.argv[5]))

    with Image.open(image_path) as raw_image:
        image = ImageOps.exif_transpose(raw_image).convert("RGBA")
        width, height = image.size
        pixel_x = clamp(round((x / page_width) * (width - 1)), 0, width - 1)
        pixel_y = clamp(round((y / page_height) * (height - 1)), 0, height - 1)
        red, green, blue, _alpha = image.getpixel((pixel_x, pixel_y))

    print(
        json.dumps(
            {
                "color": f"#{red:02X}{green:02X}{blue:02X}",
                "pixelX": pixel_x,
                "pixelY": pixel_y,
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
