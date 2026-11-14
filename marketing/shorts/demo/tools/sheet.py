#!/usr/bin/env python3
# usage: sheet.py <scene dir> <mark> <offset s>...  -> <dir>/sheet.jpg (frames at mark+offset)
import subprocess, sys
d, mark, *offs = sys.argv[1:]
fr, marks = [], {}
for l in open(f"{d}/frames.txt"):
    p = l.split()
    if p[0] == "#": marks[p[1]] = float(p[2])
    else: fr.append((p[0], float(p[1])))
m = marks.get(mark, fr[0][1])
def at(o):
    k, _, v = o.rpartition("@")
    return (marks[k] if k else m) + float(v)
pick = [min(fr, key=lambda f: abs(f[1] - at(o)))[0] for o in offs]
ins = sum([["-i", f"{d}/{p}"] for p in pick], [])
fc = "".join(f"[{i}]scale=230:-1[v{i}];" for i in range(len(pick))) + "".join(f"[v{i}]" for i in range(len(pick))) + f"hstack={len(pick)}"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", fc, f"{d}/sheet.jpg"], check=True)
print(pick)
