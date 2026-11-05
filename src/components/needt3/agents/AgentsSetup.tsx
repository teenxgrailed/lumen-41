"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { notify } from "@/lib/notifications";

import { BrandIcon, hasBrandIcon } from "../brand";
import { AgentIcon } from "./AgentIcon";
import { CONNECTOR_URL } from "./connect-guide";

const KEY = "needt:agents-onboarded";

/** Seen the first-visit setup on this device. */
export function onboardingSeen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: it shows again next time, nothing breaks.
  }
}

/** The arc: the agents people already use, in the reference's order. */
export const SETUP_AGENTS = [
  ["claude", "Claude"],
  ["chatgpt", "ChatGPT"],
  ["cursor", "Cursor"],
  ["gemini", "Gemini"],
  ["codex", "Codex"],
  ["grok", "Grok"],
  ["perplexity", "Perplexity"],
  ["mcp", "Other MCP"],
] as const;
/** The grid under it: tools that speak MCP too. */
const MORE = [
  ["github", "GitHub"],
  ["raycast", "Raycast"],
  ["n8n", "n8n"],
  ["make", "Make"],
  ["linear", "Linear"],
  ["slack", "Slack"],
  ["zapier", "Zapier"],
  ["windsurf", "Windsurf"],
  ["notion", "Notion"],
] as const;

function Tile({ id, name, size }: { id: string; name: string; size: number }) {
  if (hasBrandIcon(id)) return <BrandIcon id={id} size={size} />;
  return <AgentIcon name={name} size={size} />;
}

/**
 * Is this agent already connected? Its id or name appears in a connected
 * hub agent (name, kind) or a connected OAuth app (client name). "Other
 * MCP" counts any connection at all.
 */
export function alreadyConnected(id: string, name: string, known: string[]) {
  // Whole words only: "Claude Desktop" is Claude, "Claudette" is not.
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const named = (k: string, tid: string, tname: string) => {
    const w = words(k);
    const target = words(tname);
    return (
      w.includes(tid) ||
      (target.length > 0 && target.every((t) => w.includes(t)))
    );
  };
  if (id === "mcp") {
    // Other MCP: something connected that is none of the named agents.
    return known.some(
      (k) =>
        !SETUP_AGENTS.some(
          ([tid, tname]) => tid !== "mcp" && named(k, tid, tname)
        )
    );
  }
  return known.some((k) => named(k, id, name));
}

/** How long step 2 waits before offering to go on by hand. */
export const MANUAL_AFTER_MS = 20_000;

function Check() {
  return (
    <span className="ag-ck" aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.4 2.4 4.6-5" />
      </svg>
    </span>
  );
}

/**
 * The first visit to Agents (owner's final reference, 05.11.26), shown once
 * and again from "Replay setup":
 *
 * 1. "Connect your agents": the Needt core on top, the agents on an arc
 *    under it, joined by fanned lines that never cross; a picked agent's
 *    line draws itself in with a dot running along it. Tools that speak MCP
 *    sit in a grid below, the outer ones faded.
 * 2. Three short steps for the first picked agent, the connector address to
 *    copy, and "Waiting for …" that turns to "Connected" when a new agent
 *    shows up in the hub, or at once when that agent is already connected.
 *    After 20 s "I've connected it — continue" lets the person go on.
 * 3. The picked tiles fly into the constellation and the Map draws itself.
 *
 * Esc, or "Not now", leaves at any step.
 */
export function AgentsSetup({
  agentCount,
  known = [],
  onStep,
  onDone,
  onFinish,
}: {
  /** The current step, for the screen (it polls connections on step 2). */
  onStep?: (step: 1 | 2 | 3) => void;
  /** Connected agents right now; a rise during step 2 means "Connected". */
  agentCount: number;
  /** Names of what is already connected: hub agents, OAuth apps. */
  known?: string[];
  /** Closed without finishing. */
  onDone: () => void;
  /** Finished: the Map should draw itself again (a new layout). */
  onFinish: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const stepHook = useRef(onStep);
  stepHook.current = onStep;
  useEffect(() => stepHook.current?.(step), [step]);
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(["claude", "chatgpt"])
  );
  const [more, setMore] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const [baseline, setBaseline] = useState(agentCount);
  const top = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const still =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tiles = useRef<Record<string, HTMLButtonElement | null>>({});
  const [flyers, setFlyers] = useState<
    { id: string; name: string; rect: DOMRect }[]
  >([]);
  const [manual, setManual] = useState(false);

  useLayoutEffect(() => {
    const el = top.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  // A modal dialog: focus starts on the first agent, Tab stays inside, Esc
  // leaves (and goes no further), and focus returns where it was.
  const root = useRef<HTMLDivElement>(null);
  const finishTimer = useRef<number | null>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() =>
      root.current?.querySelector<HTMLElement>("[data-ag-setup-agent]")?.focus()
    );
    return () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
      back?.focus?.();
    };
  }, []);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        remember();
        onDone();
        return;
      }
      if (e.key !== "Tab" || !root.current) return;
      const stops = Array.from(
        root.current.querySelectorAll<HTMLElement>(
          ".ag-step.is-on button:not([disabled]), .ag-setup-skip"
        )
      );
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? at <= 0
          ? stops.length - 1
          : at - 1
        : at === stops.length - 1
          ? 0
          : at + 1;
      e.preventDefault();
      stops[next].focus();
    };
    document.addEventListener("keydown", keys, true);
    return () => document.removeEventListener("keydown", keys, true);
  }, [onDone]);

  const toggle = (id: string) => {
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleMore = (id: string) =>
    setMore((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const picked = SETUP_AGENTS.filter(([id]) => sel.has(id));
  const pickedNames = [
    ...picked.map(([, n]) => n),
    ...MORE.filter(([id]) => more.has(id)).map(([, n]) => n),
  ];
  const first = picked[0] ?? SETUP_AGENTS[7];
  const connected =
    step === 2 &&
    (agentCount > baseline || alreadyConnected(first[0], first[1], known));
  // Step 2 is never a dead end: after a while the person may go on.
  useEffect(() => {
    if (step !== 2 || connected) return undefined;
    setManual(false);
    const t = window.setTimeout(() => setManual(true), MANUAL_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [step, connected]);

  const finish = () => {
    remember();
    const list: { id: string; name: string; rect: DOMRect }[] = [];
    for (const [id, name] of picked) {
      const rect = tiles.current[id]?.getBoundingClientRect();
      if (rect) list.push({ id, name, rect });
    }
    setFlyers(list);
    setStep(3);
    onFinish();
    finishTimer.current = window.setTimeout(onDone, still ? 50 : 3800);
  };

  // Geometry of the arc (the reference's layoutSetup), in px of the top box.
  const mob = width < 600;
  const coreY = mob ? 46 : 56;
  const coreH = mob ? 27 : 32;
  const ts = mob ? 40 : 58;
  const gap = mob ? 70 : 92;
  const drop = mob ? 58 : 96;
  const RX = Math.min(width * 0.42, 560);
  const arc = SETUP_AGENTS.map((_, i) => {
    const u = (i - 3.5) / 3.5;
    const x = width / 2 + RX * u;
    const y = coreY + gap + drop * u * u;
    const sx = width / 2 + u * (mob ? 18 : 24);
    const sy = coreY + coreH;
    const ex = x;
    const ey = y - ts / 2 - 1;
    const dy = ey - sy;
    const inn = 1 - Math.abs(u);
    return {
      x,
      y,
      d: `M${sx} ${sy} C ${sx + (ex - sx) * 0.5} ${sy + 6 + inn * 16}, ${ex} ${ey - dy * 0.5}, ${ex} ${ey}`,
      sx,
      sy,
      ex,
      ey,
    };
  });

  return (
    <div
      ref={root}
      className={"ag-setup" + (step === 3 ? " is-fly" : "")}
      data-ag-onboarding=""
      role="dialog"
      aria-modal="true"
      aria-label="Connect your agents"
    >
      <div className="ag-eg is-l" aria-hidden="true" />
      <div className="ag-eg is-r" aria-hidden="true" />
      <div className="ag-cnt">{`${step} / 3`}</div>
      <button
        type="button"
        className="ag-setup-skip"
        data-ag-onboard-skip=""
        onClick={() => {
          remember();
          onDone();
        }}
      >
        Not now
      </button>

      <section
        className={"ag-step" + (step === 1 ? " is-on" : "")}
        aria-hidden={step !== 1}
      >
        <div className="ag-s-top" ref={top}>
          {width ? (
            <svg className="ag-s-lines" aria-hidden="true">
              <defs>
                {arc.map((a, i) => (
                  <linearGradient
                    key={i}
                    id={`ag-lg${i}`}
                    gradientUnits="userSpaceOnUse"
                    x1={a.sx}
                    y1={a.sy}
                    x2={a.ex}
                    y2={a.ey}
                  >
                    <stop
                      offset="0"
                      stopColor="rgb(160,205,255)"
                      stopOpacity=".25"
                    />
                    <stop
                      offset="1"
                      stopColor="rgb(90,169,255)"
                      stopOpacity=".95"
                    />
                  </linearGradient>
                ))}
              </defs>
              <path
                className="is-arc"
                d={`M${width / 2 - RX} ${coreY + gap + drop} Q ${width / 2} ${coreY + gap - drop} ${width / 2 + RX} ${coreY + gap + drop}`}
              />
              {arc.map((a, i) => {
                const id = SETUP_AGENTS[i][0];
                const on = sel.has(id);
                return (
                  <g key={id}>
                    <path className="is-base" d={a.d} />
                    <path
                      className={"is-sel" + (on ? " is-on" : "")}
                      pathLength={1}
                      d={a.d}
                      stroke={`url(#ag-lg${i})`}
                    />
                    {on && !still ? (
                      <circle r="2.6" className="ag-s-dot">
                        <animateMotion
                          dur={`${2.4 + i * 0.137}s`}
                          repeatCount="indefinite"
                          path={a.d}
                        />
                      </circle>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          ) : null}
          <div className="ag-core" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6.5" />
              <circle cx="12" cy="12" r="1.8" fill="#fff" stroke="none" />
            </svg>
          </div>
          {width
            ? SETUP_AGENTS.map(([id, name], i) => (
                <button
                  key={id}
                  ref={(el) => {
                    tiles.current[id] = el;
                  }}
                  type="button"
                  className={"ag-stile" + (sel.has(id) ? " is-sel" : "")}
                  aria-pressed={sel.has(id)}
                  aria-label={name}
                  title={name}
                  data-ag-setup-agent={id}
                  style={{
                    width: ts,
                    height: ts,
                    left: arc[i].x - ts / 2,
                    top: arc[i].y - ts / 2,
                    animationDelay: `${0.5 + i * 0.09}s`,
                  }}
                  onClick={() => toggle(id)}
                >
                  <Tile id={id} name={name} size={Math.round(ts * 0.6)} />
                  <Check />
                </button>
              ))
            : null}
        </div>
        <div className="ag-s-copy">
          <h1>Connect your agents</h1>
          <p>
            Pick the ones you already use. They share one memory and one
            calendar.
          </p>
        </div>
        <div className="ag-s-grid">
          {[MORE.slice(0, 5), MORE.slice(5)].map((row, ri) => (
            <div className="ag-s-row" key={ri}>
              {row.map(([id, name], i) => (
                <button
                  key={id}
                  type="button"
                  className={
                    "ag-stile is-grid" +
                    (i === 0 || i === row.length - 1 ? " is-fade" : "") +
                    (more.has(id) ? " is-sel" : "")
                  }
                  aria-pressed={more.has(id)}
                  aria-label={name}
                  title={name}
                  onClick={() => toggleMore(id)}
                >
                  <Tile id={id} name={name} size={mob ? 28 : 34} />
                  <Check />
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="ag-s-foot">
          <button
            type="button"
            className="ag-go"
            data-ag-setup-continue=""
            disabled={!pickedNames.length}
            onClick={() => {
              setBaseline(agentCount);
              setStep(2);
            }}
          >
            Continue
          </button>
          <small>
            {pickedNames.length ? pickedNames.join(" · ") : "Pick at least one"}
          </small>
        </div>
      </section>

      <section
        className={"ag-step" + (step === 2 ? " is-on" : "")}
        aria-hidden={step !== 2}
      >
        <div className="ag-card2">
          <div className="ag-card2-hd">
            <Tile id={first[0]} name={first[1]} size={44} />
            <div>
              <h2>{`Connect ${first[1]}`}</h2>
              <p>Three steps, about a minute</p>
            </div>
          </div>
          <div className="ag-stp">
            <i>1</i>
            <span>{`Open ${first[1]} and go to its connectors`}</span>
          </div>
          <div className="ag-stp">
            <i>2</i>
            <span>Add a custom connector and paste this address</span>
          </div>
          <div className="ag-url">
            <code data-ag-setup-url="">{CONNECTOR_URL}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(CONNECTOR_URL);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  notify.error("Could not copy");
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="ag-stp is-last">
            <i>3</i>
            <span>Approve access to your Needt</span>
          </div>
          <div
            className={"ag-stat" + (connected ? " is-ok" : "")}
            data-ag-setup-status={connected ? "ok" : "wait"}
          >
            <span className="ag-pd" aria-hidden="true" />
            <span role="status">
              {connected ? "Connected" : `Waiting for ${first[1]}…`}
            </span>
          </div>
          <div className="ag-row2">
            <button
              type="button"
              className="ag-link2"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <span className="ag-row2-r">
              {connected ? null : manual ? (
                <button
                  type="button"
                  className="ag-link2"
                  data-ag-setup-manual=""
                  onClick={finish}
                >
                  I&apos;ve connected it — continue
                </button>
              ) : (
                <button type="button" className="ag-link2" onClick={finish}>
                  Later
                </button>
              )}
              <button
                type="button"
                className="ag-go"
                disabled={!connected}
                data-ag-setup-finish=""
                onClick={finish}
              >
                Continue
              </button>
            </span>
          </div>
        </div>
      </section>

      {step === 3 ? <div className="ag-cap3">Building your map…</div> : null}
      {flyers.map((f, i) => (
        <Flyer
          key={f.id}
          id={f.id}
          name={f.name}
          rect={f.rect}
          delay={150 + i * 170}
        />
      ))}
    </div>
  );
}

/** A picked tile flying into the constellation (step 3). */
function Flyer({
  id,
  name,
  rect,
  delay,
}: {
  id: string;
  name: string;
  rect: DOMRect;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const cx = window.innerWidth * 0.545;
    const cy = window.innerHeight * 0.5;
    const dx = cx - (rect.left + rect.width / 2);
    const dy = cy - (rect.top + rect.height / 2);
    el.animate(
      [
        { transform: "none", opacity: 1, filter: "blur(0)" },
        {
          transform: `translate(${dx * 0.55}px,${dy * 0.55 - 40}px) scale(.5)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${dx}px,${dy}px) scale(.1)`,
          opacity: 0,
          filter: "blur(4px)",
        },
      ],
      {
        duration: 1500,
        delay,
        easing: "cubic-bezier(.55,0,.2,1)",
        fill: "forwards",
      }
    );
  }, [rect, delay]);
  return (
    <div
      ref={ref}
      className="ag-flyer"
      aria-hidden="true"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      <Tile id={id} name={name} size={Math.round(rect.width * 0.6)} />
    </div>
  );
}
