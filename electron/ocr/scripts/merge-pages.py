import json
import os
import sys

from PIL import Image, ImageOps


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: merge-pages.py <manifest_json>")

    with open(sys.argv[1], "r", encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)

    direction = manifest.get("direction", "vertical")
    sources = manifest.get("sources") or []
    output_path = manifest["outputPath"]
    if not sources:
        raise RuntimeError("No source pages supplied for merge")

    images = []
    for source in sources:
        with Image.open(source["path"]) as raw_image:
            images.append(ImageOps.exif_transpose(raw_image).convert("RGB"))

    if direction == "horizontal":
        width = sum(image.width for image in images)
        height = max(image.height for image in images)
    else:
        width = max(image.width for image in images)
        height = sum(image.height for image in images)

    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    placements = []
    cursor = 0
    for source, image in zip(sources, images):
        if direction == "horizontal":
            x = cursor
            y = 0
            cursor += image.width
        else:
            x = 0
            y = cursor
            cursor += image.height
        canvas.paste(image, (x, y))
        placements.append(
            {
                "sourcePageId": source["pageId"],
                "sourcePageIndex": source["pageIndex"],
                "x": x,
                "y": y,
                "width": image.width,
                "height": image.height,
            }
        )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    canvas.save(output_path, "PNG")
    print(json.dumps({"width": width, "height": height, "placements": placements}, ensure_ascii=True))


if __name__ == "__main__":
    main()
