#!/usr/bin/env python3
"""Edge-band check for the installed (standalone) app shots.
  edges.py SHOT.png light|dark [#rrggbb]

Samples the top 4 and bottom 3 pixel rows of a simulator screenshot and
compares them with the page ground (themes.css --v2p-ground; phone-ground.css).
In the installed app nothing but the page may paint there: a row that is not
the ground is the band the owner sees. Prints the measured colours either way
and exits 1 on a band."""
import sys

from PIL import Image

GROUND = {"light": (0xF6, 0xF6, 0xF3), "dark": (0x14, 0x14, 0x16)}
TOL = 8          # per channel, for the band's median colour
STRAY = 0.05     # share of pixels allowed further than 2 * TOL away (corners, AA)


def hexc(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c[:3])


def band(img, rows, ground):
    w = img.width
    px = [img.getpixel((x, y))[:3] for y in rows for x in range(w)]
    med = tuple(sorted(p[i] for p in px)[len(px) // 2] for i in range(3))
    off = sum(1 for p in px if max(abs(p[i] - ground[i]) for i in range(3)) > 2 * TOL) / len(px)
    worst = max(px, key=lambda p: max(abs(p[i] - ground[i]) for i in range(3)))
    bad = max(abs(med[i] - ground[i]) for i in range(3)) > TOL or off > STRAY
    return bad, med, off, worst


def main():
    path, theme = sys.argv[1], sys.argv[2]
    ground = GROUND[theme]
    if len(sys.argv) > 3:
        g = sys.argv[3].lstrip("#")
        ground = tuple(int(g[i:i + 2], 16) for i in (0, 2, 4))
    img = Image.open(path).convert("RGB")
    h = img.height
    fails = []
    for name, rows in (("top 4px", range(0, 4)), ("bottom 3px", range(h - 3, h))):
        bad, med, off, worst = band(img, rows, ground)
        line = (f"{path}: {name} median {hexc(med)} vs ground {hexc(ground)}, "
                f"{off:.1%} of pixels off, furthest {hexc(worst)}")
        print(("EDGE BAND " if bad else "EDGE OK   ") + line)
        if bad:
            fails.append(line)
    for f in fails:
        print(f"::error title=Edge band::{f}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
