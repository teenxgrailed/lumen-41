#!/usr/bin/env python3
"""Pixel checks on the Safari phone probe's screenshots. Web content is not in
the simulator's accessibility tree, so the checks read the PNGs. No Pillow on
the runner: `sips` (macOS) turns a shot into an uncompressed BMP.

  check-shots.py focus <shot.png>...   the focus row (additions-2/focus-done
      .fd-dockrow): the focus button and the pill are two separate objects on
      the dock line, the button fully on screen, a gap of page ground between
      them, and no New task button right of the pill.

Exits 1 with one line per failure."""
import os, struct, subprocess, sys, tempfile

PT = 402.0  # the probe's iPhone Pro is 402 pt wide; the scale follows the PNG


def load(path):
    with tempfile.TemporaryDirectory() as d:
        bmp = os.path.join(d, "s.bmp")
        subprocess.run(["sips", "-s", "format", "bmp", path, "--out", bmp], check=True, capture_output=True)
        b = open(bmp, "rb").read()
    off = struct.unpack_from("<I", b, 10)[0]
    w, h = struct.unpack_from("<ii", b, 18)
    bpp = struct.unpack_from("<H", b, 28)[0]
    step = bpp // 8
    stride = (w * step + 3) & ~3
    top_down = h < 0
    h = abs(h)
    rows = []
    for y in range(h):
        sy = y if top_down else h - 1 - y
        r = b[off + sy * stride: off + sy * stride + w * step]
        # BGR(A): luma per pixel
        rows.append([(r[i + 2] * 299 + r[i + 1] * 587 + r[i] * 114) // 1000 for i in range(0, w * step, step)])
    return w, h, rows


def runs(row, ground, thr, minlen):
    out, start = [], None
    for x, v in enumerate(row + [ground]):
        on = abs(v - ground) > thr
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start >= minlen:
                out.append((start, x - 1))
            start = None
    return out


def median(vals):
    s = sorted(vals)
    return s[len(s) // 2]


def check_focus(path):
    w, h, rows = load(path)
    k = w / PT
    # the page ground: the left strip, which no row text or chrome reaches
    ground = median([rows[y][x] for y in range(int(h * 0.30), int(h * 0.50), 4) for x in range(2, int(6 * k))])
    thr = 40
    # the dock: the first row in the lower part with a run the pill's width
    # (232 pt; 200..260 with the glass edge). The shadows fall below, so the
    # upper 30 pt of the row are read: there the objects stand apart.
    top = None
    for y in range(int(h * 0.70), int(h * 0.95)):
        if any(200 * k <= b - a + 1 <= 260 * k for a, b in runs(rows[y], ground, thr, int(20 * k))):
            top = y
            break
    if top is None:
        return [f"{path}: no dock pill found"]
    errs, seen, best = [], 0, None
    for y in range(top, top + int(30 * k)):
        found = runs(rows[y], ground, thr, int(6 * k))
        if not found:
            continue
        pa, pb = max(found, key=lambda r: r[1] - r[0])
        left = [r for r in found if r[1] < pa]
        right = [r for r in found if r[0] > pb]
        if right:
            errs.append(f"{path}: something right of the pill on the dock line, row {y} (New task?)")
            break
        if not left:
            continue
        fa, fb = left[0][0], left[-1][1]
        gap = (pa - fb - 1) / k
        seen += 1
        if fa < 2:
            errs.append(f"{path}: the focus button touches the left edge, row {y}")
            break
        if gap < 4:
            errs.append(f"{path}: the focus button runs into the pill, row {y} (gap {gap:.1f} pt)")
            break
        if best is None or fb - fa > best[1] - best[0]:
            best = (fa, fb, pa, pb, gap)
    if not errs and seen == 0:
        errs.append(f"{path}: no focus button apart from the pill on the dock line")
    if best:
        fa, fb, pa, pb, gap = best
        print(f"{os.path.basename(path)}: focus x {fa / k:.1f}..{fb / k:.1f} pt, pill {pa / k:.1f}..{pb / k:.1f} pt, gap {gap:.1f} pt")
    return errs


if __name__ == "__main__":
    cmd, paths = sys.argv[1], sys.argv[2:]
    fn = {"focus": check_focus}[cmd]
    errs = []
    for p in paths:
        errs += fn(p)
    for e in errs:
        print("FAIL", e)
    sys.exit(1 if errs else 0)
