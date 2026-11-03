#!/usr/bin/env python3
"""The "07-widgets" screenshot for every device class, and the size check.

    compose.py widgets <widget png dir> <out dir>
    compose.py verify <out dir>
    compose.py distinct <out dir>

widgets: the PNGs rendered by apps/shared/NeedtWidgetKit (widgets.yml,
ImageRenderer at 2x) set on a plain ground at each store size. These are
renders of the widgets, not a photograph of a Home Screen, and they are scaled
up from 2x: fine for a gallery slot, soft at full size.

verify: every PNG must be exactly the size in its name and one of the sizes App
Store Connect accepts for that device class; every class needs all seven
screens. Exits 1 with the list of what is wrong.

distinct: for each device class, two consecutive screens (01 and 02, 02 and 03,
...) must not look alike. A shot taken before the navigation landed repeats the
previous screen; a loading skeleton against the loaded screen is a large
difference, but the same screen twice is a difference near zero. Compared on a
64-pixel-wide grayscale copy: exits 1 when the mean absolute difference (0-255)
of a consecutive pair is below MIN_DIFF. Non-consecutive pairs below the
threshold are only warned about.
"""
import glob
import os
import sys

from PIL import Image

CLASSES = {
    # label: (width, height, columns for the widget grid, accepted sizes)
    "iphone-69": (1320, 2868, 1, {(1320, 2868), (1290, 2796)}),
    "iphone-65": (1284, 2778, 1, {(1284, 2778), (1242, 2688)}),
    "ipad-13": (2064, 2752, 2, {(2064, 2752), (2048, 2732)}),
    "mac": (2880, 1800, 2, {(2880, 1800), (2560, 1600)}),
}
SCREENS = ["01-today", "02-calendar", "03-tasks", "04-page", "05-habits", "06-focus", "07-widgets"]
GROUND = (246, 246, 243)  # LaunchGround, light
WIDGETS = [
    "ink-today-medium-normal-light.png",
    "ink-next-medium-normal-light.png",
    "ink-focus-medium-running-light.png",
    "ink-habits-medium-pro3-light.png",
]


def widgets(src, out):
    files = [os.path.join(src, f) for f in WIDGETS if os.path.exists(os.path.join(src, f))]
    if not files:
        print(f"FAIL no widget renders in {src} (wanted {WIDGETS})")
        return 1
    for label, (w, h, cols, _) in CLASSES.items():
        canvas = Image.new("RGB", (w, h), GROUND)
        rows = -(-len(files) // cols)
        margin = int(w * 0.06)
        cell_w = (w - margin * (cols + 1)) // cols
        cell_h = (h - margin * (rows + 1)) // rows
        for i, f in enumerate(files):
            img = Image.open(f).convert("RGBA")
            scale = min(cell_w / img.width, cell_h / img.height)
            size = (int(img.width * scale), int(img.height * scale))
            img = img.resize(size, Image.LANCZOS)
            r, c = divmod(i, cols)
            x = margin + c * (cell_w + margin) + (cell_w - size[0]) // 2
            y = margin + r * (cell_h + margin) + (cell_h - size[1]) // 2
            canvas.paste(img, (x, y), img)
        name = os.path.join(out, f"{label}_{w}x{h}_07-widgets.png")
        canvas.save(name)
        print(f"widgets {os.path.basename(name)} from {len(files)} renders (scaled up, approximate)")
    return 0


MIN_DIFF = 2.0


def thumb(path):
    img = Image.open(path).convert("L")
    w = 64
    return list(img.resize((w, max(1, round(img.height * w / img.width))), Image.BILINEAR).getdata())


def distinct(out):
    problems = []
    for label in CLASSES:
        shots = []
        for screen in SCREENS:
            hits = sorted(glob.glob(os.path.join(out, f"{label}_*_{screen}.png")))
            if hits:
                shots.append((screen, hits[0], thumb(hits[0])))
        for i, (sa, fa, ta) in enumerate(shots):
            for j in range(i + 1, len(shots)):
                sb, fb, tb = shots[j]
                if len(ta) != len(tb):
                    continue
                diff = sum(abs(x - y) for x, y in zip(ta, tb)) / len(ta)
                consecutive = j == i + 1
                if consecutive or diff < MIN_DIFF:
                    print(f"{label} {sa} vs {sb}: mean diff {diff:.2f}{' (consecutive)' if consecutive else ''}")
                if diff < MIN_DIFF:
                    if consecutive:
                        problems.append(f"{label}: {sa} and {sb} are near-identical (mean diff {diff:.2f} < {MIN_DIFF})")
                    else:
                        print(f"WARN {label}: {sa} and {sb} are near-identical (mean diff {diff:.2f})")
    for p in problems:
        print("PROBLEM", p)
    if not problems:
        print("every consecutive pair of shots differs")
    return 1 if problems else 0


def verify(out):
    problems = []
    for label, (w, h, _, ok) in CLASSES.items():
        for screen in SCREENS:
            hits = glob.glob(os.path.join(out, f"{label}_*_{screen}.png"))
            if not hits:
                problems.append(f"missing {label} {screen}")
                continue
            for f in hits:
                size = Image.open(f).size
                tag = os.path.basename(f).split("_")[1]
                if f"{size[0]}x{size[1]}" != tag:
                    problems.append(f"{os.path.basename(f)}: file is {size[0]}x{size[1]}")
                elif size not in ok:
                    problems.append(f"{os.path.basename(f)}: {size[0]}x{size[1]} is not an App Store size for {label}")
    for p in problems:
        print("PROBLEM", p)
    if not problems:
        print("all", len(CLASSES) * len(SCREENS), "screenshots present and the right size")
    return 1 if problems else 0


if __name__ == "__main__":
    if sys.argv[1] == "widgets":
        sys.exit(widgets(sys.argv[2], sys.argv[3]))
    if sys.argv[1] == "distinct":
        sys.exit(distinct(sys.argv[2]))
    sys.exit(verify(sys.argv[2]))
