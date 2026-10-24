#!/usr/bin/env python3
"""Pixel checks on the Safari phone probe's screenshots. Web content is not in
the simulator's accessibility tree, so the checks read the PNGs. No Pillow on
the runner: `sips` (macOS) turns a shot into an uncompressed BMP.

  check-shots.py focus <shot.png>...   the focus row (additions-2/focus-done
      .fd-dockrow): the focus button and the pill are two separate objects on
      the dock line, the button fully on screen, a gap of page ground between
      them, and no New task button right of the pill.
  check-shots.py edge <shot.png>...    the top 4 pt of the screen carry no
      sharp content (list text): every row there is near-flat, the page ground
      or blurred.

Exits 1 with one line per failure."""
import os, struct, subprocess, sys, tempfile

PT = 402.0  # the probe's iPhone Pro is 402 pt wide; the scale follows the PNG


class ShotError(Exception):
    """A shot that cannot be read (missing, empty, sips failed): reported as a
    failure of that shot, not a traceback that hides the other shots."""


def load(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        raise ShotError(f"{path}: the shot is missing or empty (the screenshot call timed out?)")
    b = None
    with tempfile.TemporaryDirectory() as d:
        bmp = os.path.join(d, "s.bmp")
        err = ""
        for attempt in range(3):  # sips on a loaded runner can fail once
            try:
                r = subprocess.run(["sips", "-s", "format", "bmp", path, "--out", bmp],
                                   capture_output=True, text=True, timeout=180)
                if os.path.exists(bmp):
                    b = open(bmp, "rb").read()
                    break
                err = (r.stdout + r.stderr).strip()[-200:]
            except subprocess.TimeoutExpired:
                err = "sips timed out"
    if b is None:
        raise ShotError(f"{path}: sips could not convert the shot ({err})")
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


def percentile(vals, q):
    s = sorted(vals)
    return s[min(len(s) - 1, int(q * len(s)))]


def focus_rows(name, w, h, rows):
    """The focus row on already decoded rows (see check_focus).

    The fog dots drift under the dock and its shadow is soft: on some rows they
    touch both objects and close the gap, or merge into the pill's edge, and a
    single such pixel row used to fail the whole shot ("gap 0.3 pt" next to a
    plainly visible gap). So every verdict is taken over the rows of the band,
    not the first row that looks wrong: a real overlap of the button and the
    pill is on a large share of the rows, a dot is on a few."""
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
        return [f"{name}: no dock pill found"]
    samples = []  # per row with a button left of the pill: (y, button left, button right, pill left, pill right)
    right_rows = 0
    nrows = 0
    for y in range(top, top + int(30 * k)):
        found = runs(rows[y], ground, thr, int(6 * k))
        if not found:
            continue
        pa, pb = max(found, key=lambda r: r[1] - r[0])
        left = [r for r in found if r[1] < pa]
        right = [r for r in found if r[0] > pb]
        nrows += 1
        if right:
            right_rows += 1
        if left:
            samples.append((y, left[0][0], left[-1][1], pa, pb))
    errs = []
    if not samples:
        return [f"{name}: no focus button apart from the pill on the dock line"]
    # a share of the rows, never one row: dots and shadow touch single rows
    share = lambda n: n / max(1, nrows)
    if share(right_rows) >= 0.3:
        errs.append(f"{name}: something right of the pill on the dock line, {right_rows} of {nrows} rows (New task?)")
    edge_rows = [y for y, fa, _, _, _ in samples if fa < 2]
    if share(len(edge_rows)) >= 0.3:
        errs.append(f"{name}: the focus button touches the left edge, row {edge_rows[0]}")
    gaps = [(pa - fb - 1) / k for _, _, fb, pa, _ in samples]
    # the 20th percentile: an overlap that closes the gap on a fifth of the rows
    # fails; a few rows bridged by a dot do not
    low = percentile(gaps, 0.2)
    if low < 4:
        errs.append(f"{name}: the focus button runs into the pill, gap {low:.1f} pt over a fifth of the "
                    f"rows (median {median(gaps):.1f} pt, narrowest {min(gaps):.1f} pt, {len(gaps)} rows)")
    y, fa, fb, pa, pb = max(samples, key=lambda r: r[2] - r[1])
    print(f"{name}: focus x {fa / k:.1f}..{fb / k:.1f} pt, pill {pa / k:.1f}..{pb / k:.1f} pt, "
          f"gap median {median(gaps):.1f} pt (narrowest {min(gaps):.1f}, 20th percentile {low:.1f})")
    return errs


def check_focus(path):
    w, h, rows = load(path)
    return focus_rows(os.path.basename(path), w, h, rows)


def selftest():
    """Synthetic dock rows: a gap bridged by dots must pass, a real overlap, a
    New task button and a button off the screen edge must fail."""
    w, h = 1206, 2622  # the probe's iPhone, 3x
    k = w / PT
    ground, dark = 244, 46

    def shot(button=(144, 335), pill=(366, 1061), extra=None, dots=()):
        rows = [[ground] * w for _ in range(h)]
        for y in range(2034, 2034 + 192):
            r = rows[y]
            for a, b in (button, pill) + ((extra,) if extra else ()):
                for x in range(a, b + 1):
                    r[x] = dark
            for a, b in dots.get(y, ()) if isinstance(dots, dict) else ():
                for x in range(a, b + 1):
                    r[x] = 190  # a fog dot, 54 under the ground: over the threshold of 40
        return rows

    def verdict(rows):
        return focus_rows("t", w, h, rows)

    clean = shot()
    # dots and soft shadow bridging the gap on 7 of the rows of the band
    # (337..372 sticks to the pill's edge, the 0.3 pt reading of the real shots;
    # 330..372 joins button and pill into one run)
    bridged = shot(dots={y: [(337, 372)] if y % 2 else [(330, 372)] for y in range(2100, 2107)})
    overlap = shot(button=(144, 360))
    newtask = shot(extra=(1100, 1190))
    edge = shot(button=(0, 190))
    checks = [("clean", clean, False), ("dots bridge 7 rows", bridged, False),
              ("button overlaps the pill", overlap, True), ("New task on the right", newtask, True),
              ("button on the screen edge", edge, True)]
    bad = 0
    for label, rows, want_fail in checks:
        errs = verdict(rows)
        ok = bool(errs) == want_fail
        bad += not ok
        print(("ok  " if ok else "BAD ") + label + (f" -> {errs}" if errs else ""))
    return bad


def check_edge(path, pts=4):
    w, h, rows = load(path)
    k = w / PT
    errs = []
    worst = 0
    for y in range(int(pts * k)):
        row = rows[y][int(2 * k): w - int(2 * k)]
        span = max(row) - min(row)
        worst = max(worst, span)
    print(f"{os.path.basename(path)}: top {pts} pt contrast {worst}")
    if worst > 30:
        errs.append(f"{path}: sharp content in the top {pts} pt (contrast {worst})")
    return errs


if __name__ == "__main__":
    if sys.argv[1] == "selftest":
        sys.exit(1 if selftest() else 0)
    cmd, paths = sys.argv[1], sys.argv[2:]
    fn = {"focus": check_focus, "edge": check_edge}[cmd]
    errs = []
    for p in paths:
        try:
            errs += fn(p)
        except ShotError as e:
            errs.append(str(e))
    for e in errs:
        print("FAIL", e)
    sys.exit(1 if errs else 0)
