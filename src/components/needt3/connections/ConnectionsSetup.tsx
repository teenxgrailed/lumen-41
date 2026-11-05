"use client";

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FiArrowRight, FiCheck, FiSearch, FiX } from "react-icons/fi";

import { BrandIcon, brandIdFor } from "../brand";
import { GlassCard } from "../scenes";
import { CalDavForm } from "./CalDavForm";
import { refocus } from "./MoreMenu";
import { type CnItem, connectPlan } from "./derive";
import {
  type ConnectionsSetupState,
  type SetupStep,
  type SourceStatus,
  listNames,
  setupRows,
  setupStatuses,
  tileDepth,
} from "./setup";
import type { ConnectionsController } from "./useConnectionsController";

/** A tile's one-word name ("Calendar", "Drive"); the card keeps the full one. */
const SHORT: Record<string, string> = {
  "google-calendar": "Calendar",
  "icloud-calendar": "iCloud",
  "outlook-calendar": "Outlook",
  "outlook-mail": "Outlook Mail",
  "google-tasks": "Tasks",
  googledrive: "Drive",
  googlesheets: "Sheets",
};
export const shortName = (i: Pick<CnItem, "slug" | "name">) =>
  SHORT[i.slug] ?? i.name;

/** Who the person signs in with, for the button and the wait line. */
function provider(i: Pick<CnItem, "slug" | "name">) {
  if (i.slug.startsWith("google") || i.slug === "gmail") return "Google";
  if (i.slug.startsWith("outlook")) return "Microsoft";
  if (i.slug === "icloud-calendar") return "Apple";
  return i.name;
}

/** What the open card says Needt does with the source. */
function promise(i: CnItem) {
  return i.kind === "mail"
    ? "Needt reads mail to turn messages into tasks. It cannot send or reply."
    : i.description;
}

function Ring() {
  return (
    <svg className="cs-ring" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="cs-ring-tr" cx="8" cy="8" r="6" />
      <circle className="cs-ring-fg" cx="8" cy="8" r="6" />
    </svg>
  );
}

function Steps({ step }: { step: SetupStep }) {
  return (
    <div className="cs-steps" data-cs-steps={step}>
      <span className="cs-bars" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i
            key={n}
            className={n === step ? "is-on" : n < step ? "is-done" : undefined}
          />
        ))}
      </span>
      <span>Step {step} of 3</span>
    </div>
  );
}

function Head({
  step,
  title,
  line,
  children,
}: {
  step: SetupStep;
  title: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <div className="cs-head nx-swap" data-px-calm>
      <Steps step={step} />
      <span className="px-kicker">Sources</span>
      <h1 className="px-display px-on-sky cs-title" tabIndex={-1}>
        {title}
      </h1>
      <p className="px-on-sky cs-line">{line}</p>
      {children}
    </div>
  );
}

/* ── Step 1: the field of tiles ─────────────────────────────────────── */

function PickStep({ s }: { s: ConnectionsSetupState }) {
  const run = s.run!;
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        search.current?.focus();
      }
    };
    // Capture: the app's own ⌘K (Open) must not take it while setup is up.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const needle = q.trim().toLowerCase();
  const rows = setupRows(s.sources.length);
  const picked = new Set(run.picked);
  const toggle = (slug: string) =>
    s.setRun({
      ...run,
      picked: picked.has(slug)
        ? run.picked.filter((x) => x !== slug)
        : s.sources
            .map((x) => x.slug)
            .filter((x) => x === slug || picked.has(x)),
    });
  let at = 0;
  return (
    <section className="cs-stage" data-cs-step="1">
      <div className="cs-glow" aria-hidden="true" />
      <div className="cs-field" role="group" aria-label="Sources">
        {rows.map((n, r) => {
          const start = at;
          at += n;
          return (
            <div key={r} className="cs-row">
              {s.sources.slice(start, start + n).map((item, c) => {
                const on = picked.has(item.slug);
                const miss =
                  !!needle &&
                  !`${item.name} ${item.slug} ${item.category}`
                    .toLowerCase()
                    .includes(needle);
                return (
                  <button
                    key={item.slug}
                    type="button"
                    className={"cs-tile px-glass" + (miss ? " is-miss" : "")}
                    aria-pressed={on}
                    aria-label={item.name}
                    data-cs-tile={item.slug}
                    style={
                      {
                        "--d": tileDepth(c, n, r, rows.length).toFixed(2),
                        "--i": start + c,
                      } as CSSProperties
                    }
                    onClick={() => toggle(item.slug)}
                  >
                    <BrandIcon id={brandIdFor(item.slug)} size={40} />
                    <span className="cs-tile-name">{shortName(item)}</span>
                    <span className="cs-check" aria-hidden="true">
                      <FiCheck size={12} strokeWidth={3.2} />
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <Head
        step={1}
        title="Connect your day"
        line="Pick the calendars, mail, files and apps you already use. Needt reads them so your plan starts from the real week."
      >
        <label className="cs-search px-glass">
          <FiSearch size={16} aria-hidden />
          <input
            ref={search}
            type="search"
            value={q}
            placeholder="Search sources"
            aria-label="Search sources"
            autoComplete="off"
            data-cs-search=""
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                // Clears the search only; the setup stays.
                e.preventDefault();
                e.stopPropagation();
                setQ("");
              }
            }}
          />
          <kbd className="cs-kbd">⌘K</kbd>
        </label>
        <div className="cs-cta" data-assistant-avoid="">
          <button
            type="button"
            className="nx-btn nx-btn-primary cs-btn"
            data-cs-continue=""
            disabled={!run.picked.length}
            onClick={() => s.setRun({ ...run, step: 2, skipped: [] })}
          >
            {run.picked.length ? `Continue (${run.picked.length})` : "Continue"}
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-text cs-link"
            data-cs-skip=""
            onClick={() => {
              s.skip();
              s.setRun({ ...run, picked: [], step: 3 });
            }}
          >
            Skip for now
          </button>
        </div>
      </Head>
    </section>
  );
}

/* ── Step 2: one at a time ──────────────────────────────────────────── */

function ConnectStep({
  s,
  c,
}: {
  s: ConnectionsSetupState;
  c: ConnectionsController;
}) {
  const run = s.run!;
  const bySlug = useMemo(
    () => new Map(s.sources.map((i) => [i.slug, i])),
    [s.sources]
  );
  const picked = run.picked
    .map((slug) => bySlug.get(slug))
    .filter((x): x is CnItem => !!x);
  const status = setupStatuses(run, c.items);
  const current = picked.find((i) => status[i.slug] === "active") ?? null;
  const done = picked.filter((i) => status[i.slug] === "done").length;
  const busy = !!current && c.busy === current.key;
  const caldav = current ? connectPlan(current).kind === "caldav" : false;
  const skip = (slug: string) =>
    s.setRun({ ...run, skipped: [...run.skipped, slug] });

  return (
    <section className="cs-stage is-two" data-cs-step="2">
      <div className="cs-glow" aria-hidden="true" />
      <Head
        step={2}
        title="One at a time"
        line="Sign in to each source. You can skip any of them and add it later."
      />
      <div className="cs-wrap">
        <GlassCard className="cs-prog" pad={14} radius={20} data-cs-prog="">
          <span className="cs-prog-t">
            <b>{done}</b> of {picked.length} connected
          </span>
          <span className="cs-prog-bars" aria-hidden="true">
            {picked.map((i) => (
              <i
                key={i.slug}
                className={
                  status[i.slug] === "done" || status[i.slug] === "skipped"
                    ? "is-on"
                    : status[i.slug] === "active"
                      ? "is-cur"
                      : undefined
                }
              />
            ))}
          </span>
        </GlassCard>
        <div className="cs-cards">
          {picked.map((i) => (
            <SourceCard
              key={i.slug}
              item={i}
              status={status[i.slug]}
              onCalDav={() => c.caldavDone()}
              onSkip={() => skip(i.slug)}
            />
          ))}
        </div>
        <div className="cs-cta" data-assistant-avoid="">
          <button
            type="button"
            className="nx-btn nx-btn-text cs-link"
            data-cs-back=""
            onClick={() => s.setRun({ ...run, step: 1 })}
          >
            Back
          </button>
          {current && !caldav ? (
            <>
              <button
                type="button"
                className="nx-btn nx-btn-primary cs-btn"
                data-cs-connect={current.slug}
                disabled={busy}
                onClick={() => void c.connect(current)}
              >
                {busy ? <Ring /> : null}
                {busy
                  ? `Waiting for ${provider(current)}…`
                  : provider(current) === "Google"
                    ? "Sign in with Google"
                    : provider(current) === "Microsoft"
                      ? "Sign in with Microsoft"
                      : `Authorize ${shortName(current)}`}
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-text cs-link"
                data-cs-skip-one={current.slug}
                disabled={busy}
                onClick={() => skip(current.slug)}
              >
                Skip for now
              </button>
            </>
          ) : !current ? (
            <button
              type="button"
              className="nx-btn nx-btn-primary cs-btn"
              data-cs-finish=""
              onClick={() => s.setRun({ ...run, step: 3 })}
            >
              Finish
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SourceCard({
  item,
  status,
  onCalDav,
  onSkip,
}: {
  item: CnItem;
  status: SourceStatus;
  onCalDav: () => void;
  onSkip: () => void;
}) {
  const open = status === "active";
  const caldav = connectPlan(item).kind === "caldav";
  const sub =
    status === "queued"
      ? "Up next"
      : status === "skipped"
        ? "Skipped, add it later in Connections"
        : status === "done"
          ? (item.account ?? "Connected")
          : caldav
            ? "Apple · CalDAV"
            : provider(item);
  return (
    <GlassCard
      className={"cs-card nx-swap" + (status === "queued" ? " is-queued" : "")}
      pad={14}
      radius={20}
      data-cs-card={item.slug}
      data-state={status}
    >
      <div className="cs-card-h">
        <BrandIcon id={brandIdFor(item.slug)} size={40} />
        <span className="cs-card-who">
          <span className="cs-card-name">{item.name}</span>
          <span className="cs-card-sub">{sub}</span>
        </span>
        {status === "done" ? (
          <span className="cs-stat" data-cs-stat="done">
            <Ring />
            Connected · syncing
          </span>
        ) : status === "skipped" ? (
          <span className="cs-stat is-mute">Skipped</span>
        ) : null}
      </div>
      {open ? (
        <div className="cs-card-body">
          {caldav ? (
            // Escape in the form cancels the form (skips this source), not
            // the whole setup.
            <div
              data-cs-caldav=""
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onSkip();
                }
              }}
            >
              <CalDavForm onSuccess={onCalDav} onCancel={onSkip} />
            </div>
          ) : (
            <p className="cs-card-p">{promise(item)}</p>
          )}
        </div>
      ) : null}
    </GlassCard>
  );
}

/* ── Step 3: done ───────────────────────────────────────────────────── */

const DOTS = Array.from({ length: 28 }, (_, i) => {
  // Fixed, not random: the same soft burst every time (and in screenshots).
  const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.4;
  const r = 130 + ((i * 53) % 220);
  return {
    x: Math.round(Math.cos(a) * r * 1.3),
    y: Math.round(Math.sin(a) * r * 0.7 - 30),
    size: 4 + (i % 4) * 1.6,
    delay: ((i * 7) % 10) / 20,
    tone: i % 3,
  };
});

function DoneStep({
  s,
  c,
}: {
  s: ConnectionsSetupState;
  c: ConnectionsController;
}) {
  const run = s.run!;
  const live = new Set(
    c.items.filter((i) => i.state === "connected").map((i) => i.slug)
  );
  const ok = s.sources.filter(
    (i) => run.picked.includes(i.slug) && live.has(i.slug)
  );
  const names = ok.map(shortName);
  return (
    <section className="cs-stage is-three" data-cs-step="3">
      <div className="cs-glow" aria-hidden="true" />
      {ok.length ? (
        <div className="cs-dots" aria-hidden="true">
          {DOTS.map((d, i) => (
            <i
              key={i}
              className={`is-t${d.tone}`}
              style={
                {
                  width: d.size,
                  height: d.size,
                  "--x": `${d.x}px`,
                  "--y": `${d.y}px`,
                  animationDelay: `${d.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
      {ok.length ? (
        <div className="cs-done-row">
          {ok.map((item, i) => (
            <div
              key={item.slug}
              className="cs-tile px-glass is-done"
              style={{ "--i": i } as CSSProperties}
              data-cs-done={item.slug}
            >
              <BrandIcon id={brandIdFor(item.slug)} size={40} />
              <span className="cs-tile-name">{shortName(item)}</span>
              <span className="cs-check" aria-hidden="true">
                <FiCheck size={12} strokeWidth={3.2} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <Head
        step={3}
        title={ok.length ? "You’re all set" : "Set up later"}
        line={
          ok.length
            ? `${listNames(names)} ${names.length > 1 ? "are" : "is"} syncing. Your first plan will be ready as soon as they finish.`
            : "Nothing is connected yet. You can add calendars, mail and apps any time from Connections."
        }
      >
        <div className="cs-cta" data-assistant-avoid="">
          <button
            type="button"
            className="nx-btn nx-btn-primary cs-btn"
            data-cs-go=""
            autoFocus
            onClick={() => exitSetup(s, c)}
          >
            Go to Connections
            <FiArrowRight size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-text cs-link"
            data-cs-more=""
            onClick={() => s.restart()}
          >
            Add more sources
          </button>
        </div>
      </Head>
    </section>
  );
}

/**
 * Leaves the setup from any step (×, Escape, Go to Connections). On steps 1
 * and 2 it counts as skipped; on step 3 as done when something got
 * connected. Either way it does not open by itself again, and the focus goes
 * back to the "Set up" that reopens it.
 */
export function exitSetup(s: ConnectionsSetupState, c: ConnectionsController) {
  const run = s.run;
  if (!run) return;
  if (run.step === 3) {
    const live = new Set(
      c.items.filter((i) => i.state === "connected").map((i) => i.slug)
    );
    s.close(run.picked.some((slug) => live.has(slug)) ? "done" : "skipped");
  } else {
    s.skip();
    s.setRun(null);
  }
  refocus("[data-cn-setup-open]", "[data-ppl-setup-open]");
}

/**
 * While `on`, everything outside `ref` is inert (the phone's modal layer):
 * each sibling along the path from the layer up to <body>. Restored after.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>, on = true) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return undefined;
    const touched: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; ) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children)) {
        if (sib === node || !(sib instanceof HTMLElement) || sib.inert)
          continue;
        sib.inert = true;
        touched.push(sib);
      }
      node = parent;
    }
    return () => touched.forEach((n) => (n.inert = false));
  }, [ref, on]);
}

/**
 * The setup itself, drawn on the sky the screen already has (the desktop
 * window's PxSky, or the phone's). Nothing here connects on its own: Connect
 * runs the card's own flow (OAuth, the CalDAV form, Composio). A × and
 * Escape leave it from any step.
 */
export function ConnectionsSetup({
  s,
  c,
}: {
  s: ConnectionsSetupState;
  c: ConnectionsController;
}) {
  const root = useRef<HTMLDivElement>(null);
  const step = s.run?.step ?? null;
  // Each step starts with its heading focused (and read).
  useEffect(() => {
    if (step)
      root.current
        ?.querySelector<HTMLElement>(".cs-title")
        ?.focus({ preventScroll: true });
  }, [step]);
  const latest = useRef({ s, c });
  latest.current = { s, c };
  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-cs-caldav]")) return;
      e.preventDefault();
      exitSetup(latest.current.s, latest.current.c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);
  if (!s.run) return null;
  return (
    <div className="cs-root" data-cs-setup={s.run.step} ref={root}>
      <button
        type="button"
        className="cs-close"
        aria-label="Close setup"
        data-cs-close=""
        data-assistant-avoid=""
        onClick={() => exitSetup(s, c)}
      >
        <FiX size={16} aria-hidden />
      </button>
      {s.run.step === 1 ? (
        <PickStep key="1" s={s} />
      ) : s.run.step === 2 ? (
        <ConnectStep key="2" s={s} c={c} />
      ) : (
        <DoneStep key="3" s={s} c={c} />
      )}
    </div>
  );
}
