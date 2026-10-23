"use client";

/* The live island at the top of Settings -> Desktop -> Island (`sd-play`,
   additions-2/settings-desktop/playground.js). There are no state buttons: the
   mini island reacts to the mouse the way the real one does, and every switch
   below it changes it at once.
     near it        it leans toward the cursor and widens a little
     hover          peeks after the hover delay; click opens (or a long hover)
     scroll         volume HUD, when the HUD module is on
     drag a file    stretches toward the file, "Drop to Shelf", the file flies in
     double-click   starts / stops a focus; press and hold shows Standby */
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import { useV3PortalContainer } from "../ctx/PortalScope";

export interface IslandCfg {
  show: boolean;
  today: boolean;
  week: boolean;
  focus: boolean;
  music: boolean;
  shelf: boolean;
  hud: boolean;
  /** Show nothing while the day is on plan. */
  dark: boolean;
  quiet: boolean;
  haptics: boolean;
  peek: "hover" | "off";
  /** Seconds. */
  delay: number;
  open: "click" | "hover";
}

type State =
  | "off"
  | "idle"
  | "idleInfo"
  | "live"
  | "peek"
  | "open"
  | "drop"
  | "dropped"
  | "hud"
  | "standby";

/* width, height, bottom radius */
const SHAPE: Record<State, readonly [number, number, number]> = {
  off: [120, 22, 8],
  idle: [120, 22, 8],
  idleInfo: [196, 22, 9],
  live: [204, 22, 9],
  peek: [300, 62, 20],
  open: [404, 168, 24],
  drop: [250, 50, 18],
  dropped: [250, 50, 18],
  hud: [230, 22, 10],
  standby: [312, 54, 18],
};
const TASKS = [
  ["Write the weekly report", "15:00", "#7d6bff"],
  ["Call mom", "16:30", "#ffb020"],
  ["Gym", "18:00", "#ff5a5f"],
] as const;
const FILES = [
  ["brief.pdf", "PDF", "#ff453a"],
  ["lookbook.jpg", "JPG", "#bf5af2"],
] as const;
const WEEK = [0.5, 0.8, 0.35, 0.7, 0.2, 0.1, 0];
const DAYS = "MTWTFSS";
const TAB_NAMES = { today: "Today", week: "Week", focus: "Focus" } as const;
type Tab = keyof typeof TAB_NAMES;
const SETTLED: readonly State[] = ["live", "idle", "idleInfo", "off"];

function Ring({ p, r, w }: { p: number; r: number; w: number }) {
  const len = 2 * Math.PI * r;
  const s = (r + w) * 2;
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      style={{ transform: "rotate(-90deg)" }}
      aria-hidden
    >
      <circle
        cx={s / 2}
        cy={s / 2}
        r={r}
        stroke="rgba(255,255,255,.2)"
        strokeWidth={w}
        fill="none"
      />
      <circle
        cx={s / 2}
        cy={s / 2}
        r={r}
        stroke="#fff"
        strokeWidth={w}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
    </svg>
  );
}

interface Ghost {
  file: (typeof FILES)[number];
  x: number;
  y: number;
}

export function IslandPlay({ cfg }: { cfg: IslandCfg }) {
  const portal = useV3PortalContainer();
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const focusRef = useRef(true);
  const [focusOn, setFocusOn] = useState(true);
  const base = useCallback((): State => {
    const c = cfgRef.current;
    if (!c.show) return "off";
    if (focusRef.current) return "live";
    return c.dark ? "idle" : "idleInfo";
  }, []);

  const stRef = useRef<State>("live");
  const [st, setSt] = useState<State>("live");
  const [leaving, setLeaving] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [openKey, setOpenKey] = useState(0);
  const [tab, setTab] = useState<Tab>("today");
  const [done, setDone] = useState<readonly number[]>([]);
  const [vol, setVol] = useState(64);
  const [dropText, setDropText] = useState("");
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const islRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Record<string, number>>({});
  const held = useRef(false);
  const dragging = useRef<(typeof FILES)[number] | null>(null);
  const grab = useRef({ x: 0, y: 0 });

  const clear = useCallback((k: string) => {
    window.clearTimeout(timers.current[k]);
    delete timers.current[k];
  }, []);
  const later = useCallback(
    (k: string, ms: number, fn: () => void) => {
      clear(k);
      timers.current[k] = window.setTimeout(fn, ms);
    },
    [clear]
  );
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((id) => window.clearTimeout(id));
  }, []);

  const go = useCallback(
    (next: State) => {
      const was = stRef.current;
      if (next === was) return;
      if (was === "open") {
        setLeaving(true);
        later("leaving", 140, () => setLeaving(false));
      }
      stRef.current = next;
      setSt(next);
      if (next === "open") {
        setOpenKey((k) => k + 1);
        setDone([]);
      }
      if (cfgRef.current.haptics && (next === "peek" || next === "open")) {
        const id = Date.now() + Math.random();
        setTicks((t) => [...t, id]);
        later(`tick${id}`, 500, () =>
          setTicks((t) => t.filter((x) => x !== id))
        );
      }
    },
    [later]
  );

  // A setting changed: a settled island follows the new base state at once.
  useEffect(() => {
    if (SETTLED.includes(stRef.current) || !cfg.show) go(base());
  }, [cfg.show, cfg.dark, focusOn, base, go]);

  const tabs = (["today", "week", "focus"] as const).filter((k) => cfg[k]);
  const shownTab: Tab | "none" = tabs.includes(tab as never)
    ? tab
    : (tabs[0] ?? "none");

  const moveInk = useCallback((el: HTMLElement | null | undefined) => {
    const ink = inkRef.current;
    if (!el || !ink) return;
    ink.style.width = `${el.offsetWidth}px`;
    ink.style.transform = `translateX(${el.offsetLeft}px)`;
  }, []);
  const activeTab = () =>
    tabsRef.current?.querySelector<HTMLElement>(".pg-tab.on");
  useEffect(() => {
    const id = requestAnimationFrame(() => moveInk(activeTab()));
    return () => cancelAnimationFrame(id);
  }, [shownTab, openKey, tabs.length, st, moveInk]);

  /* magnetic lean toward the cursor */
  const lean = (e: ReactMouseEvent) => {
    const isl = islRef.current;
    if (!isl || !cfg.show || st === "open" || dragging.current) return;
    const b = isl.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2);
    const dy = e.clientY - b.top;
    const k = Math.max(0, 1 - Math.hypot(dx, dy) / 160);
    isl.style.setProperty(
      "--tx",
      `${(Math.max(-8, Math.min(8, dx * 0.06)) * k).toFixed(1)}px`
    );
    isl.style.setProperty("--g", (1 + 0.08 * k).toFixed(3));
  };
  const unlean = () => {
    islRef.current?.style.setProperty("--tx", "0px");
    islRef.current?.style.setProperty("--g", "1");
    clear("hover");
    if (stRef.current === "peek" || stRef.current === "open")
      later("close", 350, () => go(base()));
  };

  const enter = () => {
    if (!cfg.show) return;
    clear("close");
    const d = cfg.delay * 1000;
    if (cfg.open === "hover") later("hover", d * 2 + 150, () => go("open"));
    else if (
      cfg.peek === "hover" &&
      (["live", "idle", "idleInfo"] as State[]).includes(stRef.current)
    )
      later("hover", d, () => go("peek"));
  };
  const leave = () => {
    clear("hover");
    if (stRef.current === "peek") later("close", 120, () => go(base()));
  };
  const click = () => {
    if (!cfg.show || stRef.current === "open" || held.current) return;
    if (cfg.open === "click") go("open");
  };
  const dbl = () => {
    if (!cfg.show) return;
    focusRef.current = !focusRef.current;
    setFocusOn(focusRef.current);
    go(base());
  };
  const down = () => {
    held.current = false;
    later("hold", 600, () => {
      if (!cfgRef.current.show) return;
      held.current = true;
      go("standby");
    });
  };
  const up = () => {
    clear("hold");
    window.setTimeout(() => (held.current = false), 0);
  };

  // A click outside closes the open island.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (stRef.current === "open" && !(e.target as Element).closest(".pg-box"))
        go(base());
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [base, go]);

  // Scroll over it: the volume HUD (a wheel handler that can prevent default
  // has to be non-passive, which React's own handler is not).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const wheel = (e: WheelEvent) => {
      const c = cfgRef.current;
      if (!c.show || !c.hud || stRef.current === "open") return;
      e.preventDefault();
      setVol((v) => Math.max(0, Math.min(100, Math.round(v - e.deltaY / 8))));
      go("hud");
      later("hud", 1100, () => go(base()));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [base, go, later]);

  /* drag a file onto the island */
  const startDrag = (e: ReactPointerEvent, file: (typeof FILES)[number]) => {
    e.preventDefault();
    const b = e.currentTarget.getBoundingClientRect();
    grab.current = { x: e.clientX - b.left, y: e.clientY - b.top };
    dragging.current = file;
    setGhost({ file, x: b.left, y: b.top });
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const file = dragging.current;
      const isl = islRef.current;
      if (!file || !isl) return;
      setGhost({
        file,
        x: e.clientX - grab.current.x,
        y: e.clientY - grab.current.y,
      });
      const b = isl.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const near =
        Math.hypot(e.clientX - cx, e.clientY - (b.top + b.height / 2)) < 150;
      const c = cfgRef.current;
      if (c.show && near && stRef.current !== "drop") {
        setDropText(c.shelf ? "Drop to Shelf" : "Turn on Shelf to drop files");
        go("drop");
      }
      if ((!near || !c.show) && stRef.current === "drop") go(base());
      isl.style.setProperty(
        "--tx",
        near
          ? `${Math.max(-10, Math.min(10, (e.clientX - cx) * 0.08)).toFixed(1)}px`
          : "0px"
      );
    };
    const end = () => {
      const file = dragging.current;
      if (!file) return;
      dragging.current = null;
      setGhost(null);
      if (stRef.current === "drop" && cfgRef.current.shelf) {
        setDropText(`${file[0]} is on the Shelf`);
        go("dropped");
        later("drop", 1400, () => go(base()));
      } else if (stRef.current === "drop") go(base());
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [base, go, later]);

  const [w, h, r] = SHAPE[st];
  const islStyle = {
    "--w": `${w}px`,
    "--h": `${h}px`,
    "--r": `${r}px`,
  } as CSSProperties;

  return (
    <div className="pg-host">
      <div
        className={"pg" + (cfg.show ? "" : " is-off")}
        onMouseLeave={unlean}
        onMouseMove={lean}
      >
        <div className="pg-bar0" aria-hidden>
          <b>Needt</b>
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span className="pg-sp" />
          <span>Tue 27 Oct 14:20</span>
        </div>
        <div
          ref={islRef}
          className={"pg-isl" + (leaving ? " leaving" : "")}
          data-st={st}
          style={islStyle}
        >
          <i className="pg-sh l" />
          <i className="pg-sh r" />
          <div
            ref={boxRef}
            className="pg-box"
            role="button"
            tabIndex={0}
            aria-label="Island preview. Click to open, double-click to start or stop a focus."
            onMouseEnter={enter}
            onMouseLeave={leave}
            onClick={click}
            onDoubleClick={dbl}
            onMouseDown={down}
            onMouseUp={up}
            onKeyDown={(e) => {
              if (e.key === "Enter" && cfg.show) go("open");
              if (e.key === "Escape") go(base());
            }}
          >
            <span className="pg-cam" />
            <div className="pg-c pg-c-live">
              <span>
                <Ring p={0.72} r={5} w={2} /> Deep work
              </span>
              <span className="num">18:04</span>
            </div>
            <div className="pg-c pg-c-idle">
              <span className="pg-mut">On plan</span>
              <span className="pg-mut num">next 15:00</span>
            </div>
            <div className="pg-c pg-c-peek">
              <Ring p={0.72} r={14} w={3} />
              <span className="pg-pt">
                <small>
                  Needt · Focus <i className="pg-live" />
                </small>
                <b>Deep work on the main project</b>
                <span className="pg-bar">
                  <i />
                </span>
              </span>
            </div>
            <div className="pg-c pg-c-open">
              <div
                className="pg-tabs"
                ref={tabsRef}
                onMouseLeave={() => moveInk(activeTab())}
              >
                {tabs.map((k) => (
                  <span
                    key={k}
                    className={"pg-tab" + (k === shownTab ? " on" : "")}
                    role="tab"
                    aria-selected={k === shownTab}
                    onMouseEnter={(e) => moveInk(e.currentTarget)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTab(k);
                    }}
                  >
                    {TAB_NAMES[k]}
                  </span>
                ))}
                <i className="pg-ink" ref={inkRef} />
                <span className="pg-sp" />
                {cfg.music ? (
                  <span className="pg-chip">
                    <i />
                    Night Swim
                  </span>
                ) : null}
                <span className="pg-more">•••</span>
              </div>
              <div className="pg-body" key={`${openKey}-${shownTab}`}>
                {shownTab === "today" ? (
                  <>
                    <div className="pg-hero">
                      <Ring p={0.72} r={13} w={3} />
                      <span>
                        <b>Deep work</b>
                        <small>18:04 left</small>
                      </span>
                    </div>
                    <div className="pg-rows">
                      {TASKS.map(([n, t, c], i) => (
                        <div
                          key={n}
                          className={
                            "pg-row" + (done.includes(i) ? " done" : "")
                          }
                          style={
                            { "--c": c, "--d": `${i * 50}ms` } as CSSProperties
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setDone((d) =>
                              d.includes(i)
                                ? d.filter((x) => x !== i)
                                : [...d, i]
                            );
                          }}
                        >
                          <i />
                          <span>{n}</span>
                          <small>{t}</small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : shownTab === "week" ? (
                  <div className="pg-week">
                    {WEEK.map((v, i) => (
                      <span
                        key={DAYS[i] + i}
                        style={
                          { "--v": v, "--d": `${i * 35}ms` } as CSSProperties
                        }
                      >
                        <i />
                        <small>{DAYS[i]}</small>
                      </span>
                    ))}
                  </div>
                ) : shownTab === "focus" ? (
                  <div className="pg-hero big">
                    <Ring p={1} r={20} w={4} />
                    <span>
                      <b>25:00</b>
                      <small>Next: Write the weekly report</small>
                    </span>
                  </div>
                ) : (
                  <div className="pg-empty">All Needt tabs are off</div>
                )}
              </div>
            </div>
            <div className="pg-c pg-c-drop">
              <span className="pg-dropi">⇩</span>
              <span className="pg-dropt">{dropText}</span>
            </div>
            <div className="pg-c pg-c-hud">
              <span>🔊</span>
              <span className="pg-hb">
                <i style={{ width: `${vol}%` }} />
              </span>
              <span className="num">{vol}</span>
            </div>
            <div className="pg-c pg-c-standby">
              <span className="pg-sb">
                <small>STANDBY{cfg.quiet ? " · quiet" : ""}</small>
                <b>Write the weekly report</b>
              </span>
              <span
                className="pg-go"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  focusRef.current = true;
                  setFocusOn(true);
                  go("live");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    focusRef.current = true;
                    setFocusOn(true);
                    go("live");
                  }
                }}
              >
                Go
              </span>
            </div>
          </div>
          {ticks.map((id) => (
            <i key={id} className="pg-tick" />
          ))}
        </div>
        <div className="pg-files">
          {FILES.map((f) => (
            <span
              key={f[0]}
              className={"pg-file" + (ghost && ghost.file === f ? " lift" : "")}
              style={{ "--c": f[2] } as CSSProperties}
              onPointerDown={(e) => startDrag(e, f)}
            >
              <b>{f[1]}</b>
              <small>{f[0]}</small>
            </span>
          ))}
        </div>
        <div className="pg-hint">
          Hover · click · scroll for volume · drag a file in · double-click to
          start or stop a focus · press and hold for Standby
        </div>
        <div className="pg-off">The island is off</div>
      </div>
      {ghost && portal
        ? createPortal(
            <span
              className="pg-ghost"
              style={
                {
                  left: ghost.x,
                  top: ghost.y,
                  "--c": ghost.file[2],
                } as CSSProperties
              }
            >
              <b>{ghost.file[1]}</b>
              <small>{ghost.file[0]}</small>
            </span>,
            portal
          )
        : null}
    </div>
  );
}
