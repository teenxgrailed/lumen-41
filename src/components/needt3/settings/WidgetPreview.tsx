"use client";

/* Settings -> Desktop -> Widgets: the live preview of the Today medium widget in
   the style that is selected, light and dark side by side. Built from the lab's
   own markup (additions-2/widgets/wg.js, the Today medium of each style) and CSS
   (widget-preview.css, ported from wg.css), at the widget's real size, 338 x 158.
   The rows are the person's own tasks for today when there are some. The per-style
   fonts are not shipped: the lab's stacks fall back to the system fonts. */
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { newDate } from "@/lib/date-utils";

import {
  type PreviewDay,
  type PreviewTask,
  arcSun,
  pixelLevels,
  previewDay,
  sampleDay,
} from "./widget-preview-data";

export type WidgetStyleKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

/** The person's tasks for today, or the lab's sample until (and unless) they load. */
export function useWidgetPreviewDay(): PreviewDay {
  const [day, setDay] = useState<PreviewDay>(() => sampleDay());
  useEffect(() => {
    let live = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (live && raw) setDay(previewDay(raw, newDate(), tz));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return day;
}

const ICON_CHECK = (c: string, s: number) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M3.5 8.5l3 3 6-7"
      stroke={c}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Frame({
  cls,
  children,
}: {
  cls: string;
  children: ReactNode;
}): ReactNode {
  return <div className={`w m ${cls}`}>{children}</div>;
}

/* ---------- A · Sky ---------- */
function Sky({ d, dark }: { d: PreviewDay; dark: boolean }) {
  const sun = arcSun(d.dayProgress, 150, 158, 0.3, 1.32);
  const rows = d.tasks.slice(0, 4);
  return (
    <Frame cls={`sky ${dark ? "night" : "day"}`}>
      <i className="clouds" />
      <div className="sky-arcbox">
        <i
          className="arc"
          style={{ left: "-30%", right: "-30%", bottom: "-132%" }}
        />
        <i
          className={`sun${dark ? " moon" : ""}`}
          style={{ left: sun.left, top: sun.top }}
        />
      </div>
      <div className="pad" style={{ right: "auto", width: 104 }}>
        <span className="t13 b">{d.weekday}</span>
        <span className="t12 a2">{d.date}</span>
        <div style={{ marginTop: 8 }}>
          <span className="big num">{d.left}</span>
          <span className="t13 b"> left</span>
        </div>
        <span className="t12 a2">{d.done} done</span>
      </div>
      <div className="glass sky-list">
        {rows.map((t, i) => (
          <div className="rowf" key={i}>
            <span className={`ck ${t.done ? "on" : ""}`} />
            <span
              className={`t13 ell ${t.done ? "a3" : "b"}`}
              style={t.done ? { textDecoration: "line-through" } : undefined}
            >
              {t.title}
            </span>
            {t.time && (
              <span
                className="t12 a2 num"
                style={{ marginLeft: "auto", flex: "none" }}
              >
                {t.time}
              </span>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ---------- B · Pixel ---------- */
const MASCOT = [
  "..BBBBBBB..",
  ".BLLLLLLLB.",
  "BLLLLLLLLLB",
  "BBBBBBBBBBB",
  "BBBBBBBBBBB",
  "BBBB...BBBB",
  "BBB.....BBB",
  "BBB.....BBB",
  "BB.......BB",
];

function Mascot({ color, size }: { color: string; size: number }) {
  const g = MASCOT.map((r) => r.split(""));
  const eyes: [number, number, string][] = [
    [3, 2, "W"],
    [3, 3, "K"],
    [4, 2, "W"],
    [4, 3, "W"],
    [3, 7, "W"],
    [3, 8, "K"],
    [4, 7, "W"],
    [4, 8, "W"],
    [4, 1, "P"],
    [4, 9, "P"],
  ];
  eyes.forEach(([y, x, k]) => (g[y][x] = k));
  const fill: Record<string, string> = {
    B: color,
    L: `color-mix(in srgb, ${color} 55%, #fff)`,
    K: "#15141f",
    W: "#fff",
    P: "#ff9fb8",
  };
  return (
    <svg
      className="mascot"
      width={11 * size}
      height={9 * size}
      viewBox={`0 0 ${11 * size} ${9 * size}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {g.flatMap((row, y) =>
        row.map((k, x) =>
          k === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x * size}
              y={y * size}
              width={size}
              height={size}
              fill={fill[k]}
            />
          )
        )
      )}
    </svg>
  );
}

function Pixel({ d, dark }: { d: PreviewDay; dark: boolean }) {
  const next = d.tasks.find((t) => !t.done);
  const levels = pixelLevels(d.tasks, d.clock);
  return (
    <Frame cls={`px ${dark ? "" : "lt"}`}>
      <div className="pad">
        <div className="rowf between">
          <span className="t13 b">
            {d.weekday} · {d.left} left
          </span>
          <span className="t12 a2">08 → 21</span>
        </div>
        <div className="grow" />
        <div
          className="grid"
          style={
            {
              gridTemplateColumns: "repeat(26,1fr)",
              "--c": "#8f7dff",
            } as CSSProperties
          }
        >
          {levels.map((l, i) => (
            <i key={i} className={l === -1 ? "now" : l ? `f${l}` : undefined} />
          ))}
        </div>
        <div
          className="rowf"
          style={{ marginTop: 8, justifyContent: "space-between" }}
        >
          <Mascot color="#8f7dff" size={3} />
          <span className="t12 a2 ell">
            {d.done} done{next ? ` · next: ${next.title} ${next.time}` : ""}
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ---------- C · Bento ---------- */
function Bento({ d, dark }: { d: PreviewDay; dark: boolean }) {
  const card = dark ? "#1d1c28" : "#fff";
  const rows = d.tasks.filter((t) => !t.done).slice(0, 4);
  return (
    <Frame cls={`bn${dark ? " dkbg" : ""}`}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: dark ? "#121119" : "#eceae2",
        }}
      />
      <div
        className="tile bt"
        style={{
          left: 8,
          top: 8,
          bottom: 8,
          width: 128,
          background: "#F9DF6D",
          color: "#17162b",
        }}
      >
        <div className="pad" style={{ inset: 12 }}>
          <span className="k">Today</span>
          <div className="grow" />
          <span className="huge num">{d.left}</span>
          <span className="t12 b">left · {d.done} done</span>
        </div>
      </div>
      <div
        className="tile bt"
        style={{
          left: 144,
          right: 8,
          top: 8,
          bottom: 8,
          background: card,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {rows.map((t, i) => (
          <div className="rowf" key={i}>
            <i
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: t.color,
                flex: "none",
              }}
            />
            <span className="t13 b ell">{t.title}</span>
            {t.time && (
              <span
                className="t12 num"
                style={{ marginLeft: "auto", opacity: 0.55, flex: "none" }}
              >
                {t.time}
              </span>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ---------- D · Ink ---------- */
function Ink({ d, dark }: { d: PreviewDay; dark: boolean }) {
  const next = d.tasks.find((t) => !t.done);
  return (
    <Frame cls={`ink${dark ? " dk" : ""}`}>
      <div className="pad" style={{ flexDirection: "row", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rowf between">
            <span className="t13 b">Today</span>
            <span className="t12 a3 num">{d.left} left</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 10,
            }}
          >
            {d.tasks.slice(0, 3).map((t, i) => (
              <div className="rowf" key={i}>
                <span className={`ckb ${t.done ? "on" : ""}`} />
                <span className={`t13 ell ${t.done ? "a3" : ""}`}>
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="card"
          style={{
            position: "relative",
            width: 118,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            flex: "none",
          }}
        >
          <span className="t12 a3">Next event</span>
          <span className="t13 b ell" style={{ marginTop: 4 }}>
            {next?.title ?? "Nothing planned"}
          </span>
          {next?.time && <span className="t12 a2 num">{next.time}</span>}
        </div>
      </div>
    </Frame>
  );
}

/* ---------- E · Lucky cat ---------- */
function Cat({ d, dark }: { d: PreviewDay; dark: boolean }) {
  const rows = d.tasks.filter((t) => !t.done).slice(0, 4);
  return (
    <Frame cls={`bn cat-w${dark ? " dkbg" : ""}`}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: dark ? "#17161f" : "#f6efe4",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 120,
          background: "radial-gradient(120% 90% at 60% 0%, #f4743f, #cf4a1c)",
        }}
      />
      <span className="lcat" style={{ height: 138, right: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/widgets/cat-body.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="arm" src="/widgets/cat-arm.png" alt="" />
      </span>
      <div className="pad" style={{ right: 136 }}>
        <div className="rowf between">
          <span className="k">Today</span>
          <span className="t12 b" style={{ opacity: 0.55 }}>
            {d.left} left
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 7,
            marginTop: 10,
          }}
        >
          {rows.map((t, i) => (
            <div
              className="ctask rowf"
              key={i}
              style={{ "--c": t.color } as CSSProperties}
            >
              <span className="ckb2" />
              <span className="t13 b ell">{t.title}</span>
              {t.time && (
                <span
                  className="t12 num"
                  style={{ marginLeft: "auto", opacity: 0.5, flex: "none" }}
                >
                  {t.time}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ---------- F · Noir ---------- */
function Noir({ d }: { d: PreviewDay }) {
  const rows = d.tasks.filter((t) => !t.done).slice(0, 2);
  const total = d.tasks.length;
  const dots = Array.from({ length: 18 }, (_, i) =>
    i < 6 ? (i < d.done ? "y" : "k") : i < 12 ? "k" : "d"
  );
  return (
    <Frame cls="nr">
      <div className="pad" style={{ right: 150 }}>
        <span className="nr-h">
          Today<sup>{d.left}</sup>
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            marginTop: 10,
          }}
        >
          {rows.map((t, i) => (
            <div
              className={`nr-row ${i === 0 ? "on" : ""}`}
              key={i}
              style={{ opacity: 1 - i * 0.3 }}
            >
              <span className="ell">
                <b>{t.title}</b>
                {t.time && <small>{t.time}</small>}
              </span>
              <i className="nr-ck" />
            </div>
          ))}
        </div>
      </div>
      <div
        className="nr-tile"
        style={{
          position: "absolute",
          right: 10,
          top: 10,
          bottom: 10,
          width: 132,
          padding: 12,
        }}
      >
        <div className="rowf between">
          <span className="nr-num" style={{ fontSize: 30 }}>
            {d.done}/{total}
          </span>
          <span className="nr-cap">DONE</span>
        </div>
        <div
          className="dm"
          style={{ gridTemplateColumns: "repeat(6,1fr)", marginTop: 12 }}
        >
          {dots.map((k, i) => (
            <i key={i} className={k} />
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ---------- G · Mist ---------- */
function Mist({ d }: { d: PreviewDay }) {
  const total = Math.max(1, d.tasks.length);
  const p = d.done / total;
  const R = 15;
  const L = 2 * Math.PI * R;
  const s = (R + 1.6) * 2;
  return (
    <Frame cls="ms">
      <i
        className="mist"
        style={
          {
            "--m1": "#8f9aa6",
            "--m2": "#c99b98",
            "--m3": "#6f7d86",
          } as CSSProperties
        }
      />
      <div className="pad">
        <div className="rowf" style={{ gap: 12 }}>
          <span className="mring">
            <svg
              className="ring"
              width={s}
              height={s}
              viewBox={`0 0 ${s} ${s}`}
              style={{ transform: "rotate(-90deg)" }}
              aria-hidden
            >
              <circle
                cx={s / 2}
                cy={s / 2}
                r={R}
                stroke="rgba(255,255,255,.18)"
                strokeWidth="1.6"
                fill="none"
              />
              <circle
                cx={s / 2}
                cy={s / 2}
                r={R}
                stroke="rgba(255,255,255,.9)"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={L}
                strokeDashoffset={L * (1 - p)}
              />
            </svg>
            <span>{ICON_CHECK("#fff", 10)}</span>
          </span>
          <span className="mtit">
            {d.weekday}
            <br />
            {d.date}
          </span>
        </div>
        <div className="grow" />
        <div className="rowf" style={{ gap: 34 }}>
          <div>
            <div className="mlab">Left</div>
            <div className="mnum">
              {d.left}
              <small>tasks</small>
            </div>
          </div>
          <div>
            <div className="mlab">Done</div>
            <div className="mnum">{d.done}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------- H · Rim ---------- */
function Rim({ d }: { d: PreviewDay }) {
  const next = d.tasks.find((t) => !t.done);
  return (
    <Frame cls="hr">
      <div
        className="hin"
        style={{
          background:
            "radial-gradient(120% 80% at 30% 20%, rgba(170,200,140,.35), transparent 60%), radial-gradient(80% 60% at 80% 90%, rgba(10,30,15,.7), transparent 70%), linear-gradient(160deg, #4f7a45, #2b4a2a 70%, #1c321d)",
        }}
      >
        <i className="grain" />
        <div
          className="pad"
          style={{
            inset: 14,
            alignItems: "center",
            textAlign: "center",
            justifyContent: "center",
          }}
        >
          <span className="hbig" style={{ fontSize: 34 }}>
            {d.left} tasks left
          </span>
          {next && (
            <div style={{ marginTop: 10, maxWidth: "100%" }}>
              <span className="hcopy ell">
                Next · {next.title} {next.time}
              </span>
            </div>
          )}
        </div>
        <span className="hchip" style={{ right: 14, top: 14 }}>
          {ICON_CHECK("#fff", 12)}
        </span>
      </div>
    </Frame>
  );
}

function Widget({
  style,
  day,
  dark,
}: {
  style: WidgetStyleKey;
  day: PreviewDay;
  dark: boolean;
}) {
  switch (style) {
    case "A":
      return <Sky d={day} dark={dark} />;
    case "B":
      return <Pixel d={day} dark={dark} />;
    case "C":
      return <Bento d={day} dark={dark} />;
    case "E":
      return <Cat d={day} dark={dark} />;
    case "F":
      return <Noir d={day} />;
    case "G":
      return <Mist d={day} />;
    case "H":
      return <Rim d={day} />;
    default:
      return <Ink d={day} dark={dark} />;
  }
}

export function WidgetPreview({
  style,
  name,
  day,
}: {
  style: WidgetStyleKey;
  name: string;
  day: PreviewDay;
}) {
  return (
    <div className="wpv" data-style={style} data-testid="widget-preview">
      {([false, true] as const).map((dark) => (
        <figure
          className={"wpv-cell" + (dark ? " wpv-dk" : "")}
          key={`${dark}`}
        >
          <div
            className="wpv-stage"
            role="img"
            aria-label={`${name} Today widget, ${dark ? "dark" : "light"}`}
          >
            <Widget style={style} day={day} dark={dark} />
          </div>
          <figcaption>{dark ? "Dark" : "Light"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export type { PreviewTask };
