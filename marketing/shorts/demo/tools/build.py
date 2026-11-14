#!/usr/bin/env python3
"""Cut one Needt demo short from recorded scenes.

usage: build.py <spec.json> <out.mp4>

spec:
  {
    "segments": [{"dir": "...", "from": ["tap", -2.5], "to": ["tap", 6.3]}],
    "captions": [{"t": 0.0, "end": 2.4, "text": "I ignored 9 tasks for a week.", "hl": ["9"]}],
    "sfx": [{"t": 2.5, "file": "click_003.wav", "gain": 0}],
    "end": {"title": "...", "line": "...", "url": "use.needt.app", "seconds": 2.4}
  }

Times in captions/sfx are seconds on the final timeline. Segment marks come
from each scene's frames.txt (written by record.ts); a mark of "" means the
first frame. Frames keep their real capture timing (variable rate in, 30 fps
out). Layout: dark canvas 1080x1920, the app at 80 % with rounded corners
below a caption band. Captions appear word by word, the current word in yellow.
Audio: CC BY music bed (credit in the post text) + Kenney CC0 SFX, -14 LUFS.
"""
import json, os, subprocess, sys, tempfile

ASSETS = "/home/max/code/lumen-41/marketing/brag-launch/composition/assets"
FONT_DIR = "/home/max/shorts-out/fonts"  # Inter 800, static instance of Inter-V
ICON = "/home/max/shorts-out/icon.png"  # app icon rendered by icon.ts
W, H, FPS = 1080, 1920, 30
APP_SCALE = 0.80
AW, AH = int(W * APP_SCALE) // 2 * 2, int(H * APP_SCALE) // 2 * 2
AX, AY = (W - AW) // 2, H - AH - 60
BG = "0x0B0B0E"
YELLOW, WHITE = "&H0000D6FF&", "&H00FFFFFF&"


def run(*a):
    subprocess.run([str(x) for x in a], check=True)


def frames(d):
    fr, marks = [], {}
    for l in open(f"{d}/frames.txt"):
        p = l.split()
        if not p:
            continue
        if p[0] == "#":
            marks[p[1]] = float(p[2])
        else:
            fr.append((p[0], float(p[1])))
    return fr, marks


def segment(seg, out, tmp):
    fr, marks = frames(seg["dir"])
    base = lambda m: marks[m[0]] if m[0] else fr[0][1]
    t0 = base(seg["from"]) + seg["from"][1]
    t1 = base(seg["to"]) + seg["to"][1]
    sel = [f for f in fr if t0 <= f[1] <= t1]
    lst = os.path.join(tmp, os.path.basename(out) + ".txt")
    with open(lst, "w") as fh:
        for i, (name, ts) in enumerate(sel):
            nxt = sel[i + 1][1] if i + 1 < len(sel) else t1
            fh.write(f"file '{seg['dir']}/{name}'\nduration {max(nxt - ts, 0.001):.4f}\n")
        fh.write(f"file '{seg['dir']}/{sel[-1][0]}'\n")
    run("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
        "-vf", f"fps={FPS},scale={W}:{H}:flags=lanczos,format=yuv420p",
        "-c:v", "libx264", "-crf", "14", "-preset", "medium", out)
    return t1 - t0


def ass_time(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def captions_ass(caps, end, path):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter V Extra Bold,74,{WHITE},{WHITE},&H00000000&,&H00000000&,-1,0,0,0,100,100,-1,0,1,0,0,8,70,70,{AY - 250 if AY > 330 else 70}
Style: EndT,Inter V Extra Bold,120,{WHITE},{WHITE},&H00000000&,&H00000000&,-1,0,0,0,100,100,-3,0,1,0,0,5,80,80,0
Style: EndL,Inter V Extra Bold,58,{WHITE},{WHITE},&H00000000&,&H00000000&,0,0,0,0,100,100,0,0,1,0,0,5,90,90,0
Style: EndU,Inter V Extra Bold,54,{YELLOW},{YELLOW},&H00000000&,&H00000000&,-1,0,0,0,100,100,0,0,1,0,0,5,90,90,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for c in caps:
        words = c["text"].split()
        hl = {h.lower() for h in c.get("hl", [])}
        n = len(words)
        span = min((c["end"] - c["t"]) * 0.7, n * 0.24)
        times = [c["t"] + span * k / n for k in range(n)] + [c["end"]]
        y = c.get("y")
        pos = f"{{\\an8\\pos({W // 2},{y})}}" if y else ""
        for k in range(n):
            parts = []
            for j, w in enumerate(words):
                key = w.strip(".,:;!?\"'“”").lower()
                col = YELLOW if (j == k or key in hl) else WHITE
                alpha = "&H00&" if j <= k else "&HFF&"
                parts.append(f"{{\\c{col}\\alpha{alpha}}}{w}")
            stop = times[k + 1] if k + 1 < n else min(times[k] + 0.3, c["end"])
            ev.append(f"Dialogue: 0,{ass_time(times[k])},{ass_time(stop)},Cap,,0,0,0,,{pos}" + " ".join(parts))
        if times[n - 1] + 0.3 < c["end"]:
            rest = []
            for w in words:
                key = w.strip(".,:;!?\"'“”").lower()
                rest.append(f"{{\\c{YELLOW if key in hl else WHITE}}}{w}")
            ev.append(f"Dialogue: 0,{ass_time(times[n - 1] + 0.3)},{ass_time(c['end'])},Cap,,0,0,0,,{pos}" + " ".join(rest))
    if end:
        s, e = end["start"], end["start"] + end["seconds"]
        fade = "{\\fad(250,0)}"
        ev.append(f"Dialogue: 0,{ass_time(s)},{ass_time(e)},EndT,,0,0,0,,{fade}{{\\pos({W // 2},{H // 2 - 170})}}Needt")
        ev.append(f"Dialogue: 0,{ass_time(s + 0.15)},{ass_time(e)},EndL,,0,0,0,,{fade}{{\\pos({W // 2},{H // 2 + 10})}}{end['line']}")
        ev.append(f"Dialogue: 0,{ass_time(s + 0.3)},{ass_time(e)},EndU,,0,0,0,,{fade}{{\\pos({W // 2},{H // 2 + 190})}}{end['url']}")
    open(path, "w").write(head + "\n".join(ev) + "\n")


def mask(path):
    from PIL import Image, ImageDraw
    m = Image.new("L", (AW, AH), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, AW - 1, AH - 1], radius=54, fill=255)
    m.save(path)


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    tmp = tempfile.mkdtemp(prefix="short-")
    segs, total = [], 0.0
    for i, s in enumerate(spec["segments"]):
        p = f"{tmp}/seg{i}.mp4"
        total += segment(s, p, tmp)
        segs.append(p)
    lst = f"{tmp}/segs.txt"
    open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    app = f"{tmp}/app.mp4"
    run("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", app)
    end = spec.get("end")
    dur = total + (end["seconds"] if end else 0)
    if end:
        end["start"] = total
    ass = f"{tmp}/cap.ass"
    captions_ass(spec["captions"], end, ass)
    mk = f"{tmp}/mask.png"
    mask(mk)
    # Video: canvas + rounded app (hidden during the end card) + captions.
    fc = (
        f"color=c={BG}:s={W}x{H}:r={FPS}:d={dur:.3f}[bg];"
        f"[0:v]scale={AW}:{AH}:flags=lanczos,format=rgba[a];[1:v]format=gray[m];[a][m]alphamerge[am];"
        f"[bg][am]overlay={AX}:{AY}:eof_action=pass:enable='lt(t,{total:.3f})'[v1];"
        f"[v1]subtitles={ass}:fontsdir={FONT_DIR}[v2];"
        f"[3:v]format=rgba,fade=t=in:st={total:.3f}:d=0.25:alpha=1[ic];"
        f"[v2][ic]overlay=(W-w)/2:{H // 2 - 470}:enable='gte(t,{total:.3f})',format=yuv420p[v]"
    )
    # Audio: music bed + sfx, loudness to -14 LUFS.
    icon = ICON
    ins = ["-i", app, "-loop", "1", "-i", mk, "-i", f"{ASSETS}/music.mp3", "-loop", "1", "-i", icon]
    afc = [f"[2:a]atrim=0:{dur:.3f},volume=0.32,afade=t=in:d=0.3,afade=t=out:st={dur - 0.8:.3f}:d=0.8[mus]"]
    labels = ["[mus]"]
    for k, s in enumerate(spec.get("sfx", [])):
        ins += ["-i", f"{ASSETS}/sfx/{s['file']}"]
        idx = 4 + k
        ms = int(s["t"] * 1000)
        afc.append(f"[{idx}:a]volume={10 ** (s.get('gain', 0) / 20):.3f},adelay={ms}|{ms}[s{k}]")
        labels.append(f"[s{k}]")
    afc.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]")
    run("ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", fc + ";" + ";".join(afc),
        "-map", "[v]", "-map", "[a]", "-t", f"{dur:.3f}", "-r", FPS,
        "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out)
    print(out, f"{dur:.2f}s")


if __name__ == "__main__":
    main()
