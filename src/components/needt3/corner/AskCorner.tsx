"use client";

/* THE CORNER (v3) — Ask Needt, the notifications island, one element.
 *
 * Bottom-right is the one place this product speaks from. Closed it is the
 * pill; when something happened it grows into the island and carries the
 * notice (Undo included); open it is the panel. Pill → island → panel is ONE
 * element: it is laid out at the largest size and the visible shape is a
 * clip-path anchored bottom-right (`cornerClip`), so the change of size is a
 * clip, never a width/height animation. The island is never a toast — no
 * second object arrives beside the pill.
 *
 * Notices come from the `notify` facade (src/lib/notifications.ts) through
 * the bridge in needt/corner; this mounts the sink for the v3 frame, where the
 * old AppShell's <NeedtNotices> does not exist. Hovering the island, focus
 * inside it, or having the panel open holds the dismiss clocks.
 */
import * as React from "react";

import { useRouter } from "next/navigation";

import {
  LuCalendarCheck,
  LuCheck,
  LuLink,
  LuMoveRight,
  LuSparkles,
  LuTriangleAlert,
  LuUser,
  LuX,
} from "react-icons/lu";

import { setNoticeSink } from "@/components/needt/corner/bridge";
import {
  NeedtNoticeProvider,
  useNoticeStack,
  useNotify,
} from "@/components/needt/corner/notices";
import type {
  Notice,
  NoticeAct,
  NoticeKind,
} from "@/components/needt/corner/types";

import {
  CORNER_PILL,
  cornerClip,
  cornerFrame,
  cornerIsland,
  cornerPanel,
} from "@/lib/assistant-position";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useExit } from "../ctx/useExit";
import { AiOrb } from "../orb/AiOrb";
import { ChatPanel } from "./ChatPanel";
import { hiddenLabel, islandHasRows, islandView, primaryAct } from "./island";
import { useAskNeedt } from "./useAskNeedt";

/** The clip's travel; owner value (PORT §6: 0.42s rise-and-settle). */
const MORPH_MS = 420;

const KINDS: Record<
  NoticeKind,
  { Icon: React.ComponentType<{ size?: number }>; tone: string }
> = {
  placed: { Icon: LuCalendarCheck, tone: "var(--accent)" },
  moved: { Icon: LuMoveRight, tone: "var(--accent)" },
  risk: { Icon: LuTriangleAlert, tone: "var(--destructive)" },
  done: { Icon: LuCheck, tone: "var(--success)" },
  agent: { Icon: LuSparkles, tone: "var(--accent)" },
  person: { Icon: LuUser, tone: "var(--info)" },
  blocked: { Icon: LuLink, tone: "var(--destructive)" },
};

/** Hands the mounted island to the plain-function `notify` facade. */
function Sink() {
  const api = useNotify();
  React.useEffect(() => {
    setNoticeSink(api);
    return () => setNoticeSink(null);
  }, [api]);
  return null;
}

function useViewportHeight(): number {
  const [vh, setVh] = React.useState(900);
  React.useEffect(() => {
    const read = () => setVh(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return vh;
}

function IslandRow({
  notice,
  onAct,
  onClose,
}: {
  notice: Notice;
  onAct: (n: Notice, a: NoticeAct) => void;
  onClose: (id: string) => void;
}) {
  const kind = KINDS[notice.kind] ?? KINDS.agent;
  const act = primaryAct(notice);
  return (
    <div
      className="v3c-row chat-msg-in"
      data-island-row={notice.id}
      data-leaving={notice.leaving ? "" : undefined}
    >
      <span
        className="shell-nf-card-grid"
        aria-hidden="true"
        style={{
          color: kind.tone,
          background: `color-mix(in oklab, ${kind.tone} 15%, transparent)`,
        }}
      >
        <kind.Icon size={15} />
      </span>
      <span className="v3c-text">
        <span className="chat-span-4 v3c-line">{notice.title}</span>
        {notice.body ? (
          <span className="chat-span-8 v3c-line">{notice.body}</span>
        ) : null}
      </span>
      {act ? (
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm nx-press"
          onClick={() => onAct(notice, act)}
        >
          {act.label}
        </button>
      ) : null}
      <button
        type="button"
        className="chat-tool v3c-x"
        aria-label="Dismiss"
        onClick={() => onClose(notice.id)}
      >
        <LuX size={13} />
      </button>
    </div>
  );
}

function Corner() {
  const router = useRouter();
  const open = useNeedt3Ui((s) => s.askOpen);
  const setOpen = useNeedt3Ui((s) => s.setAskOpen);
  const { notices, hold, release } = useNoticeStack();
  const { dismiss } = useNotify();
  const ask = useAskNeedt();
  const vh = useViewportHeight();
  const [hovering, setHovering] = React.useState(false);
  /* Keyboard focus inside the island, kept apart from the mouse so a mouse
     leaving does not drop a held focus and a focus leaving does not drop a
     hover. */
  const [focused, setFocused] = React.useState(false);
  /* A notice's question, waiting for the reply in flight to finish. */
  const [queued, setQueued] = React.useState<string | null>(null);
  const [panelShown] = useExit(open, MORPH_MS);
  const pillRef = React.useRef<HTMLButtonElement>(null);
  const islandRef = React.useRef<HTMLDivElement>(null);
  const refocus = React.useRef(false);

  /* Reading the panel or reaching for a row both stop the clocks. */
  React.useEffect(() => {
    if (open || hovering || focused) hold();
    else release();
  }, [open, hovering, focused, hold, release]);

  const view = islandView(notices);
  const counted = hiddenLabel(view.hidden);
  const island = !open && islandHasRows(notices);

  const pill = CORNER_PILL;
  const islandSize = cornerIsland(view.rows.length, !!counted);
  const panel = cornerPanel(vh);
  const frame = cornerFrame(pill, islandSize, panel);
  const state = open ? "panel" : island ? "island" : "pill";
  const shape =
    state === "panel" ? panel : state === "island" ? islandSize : pill;

  function act(n: Notice, a: NoticeAct) {
    dismiss(n.id);
    if (a.say) {
      setOpen(true);
      // A reply is still streaming: the question waits its turn rather than
      // being dropped by send().
      if (ask.phase === "idle") void ask.send(a.say);
      else setQueued(a.say);
    }
    if (a.go) router.push(a.go.startsWith("/") ? a.go : `/${a.go}`);
    a.run?.();
  }

  /* A focused row that is dismissed, or an island that turns inert, takes
     the focus away without a focusout; check again so the clocks resume. */
  React.useEffect(() => {
    if (!focused) return;
    const el = islandRef.current;
    if (state !== "island" || !el || !el.contains(document.activeElement)) {
      setFocused(false);
    }
  }, [focused, state, notices]);

  const { phase: askPhase, send: askSend } = ask;
  React.useEffect(() => {
    if (!queued || askPhase !== "idle") return;
    setQueued(null);
    void askSend(queued);
  }, [queued, askPhase, askSend]);

  /* Escape hands the focus back to the corner it came from: the pill, or
     the island's first control when the island is what is showing. */
  React.useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    const target =
      state === "island"
        ? islandRef.current?.querySelector<HTMLElement>("button")
        : pillRef.current;
    target?.focus();
  }, [open, state]);

  const urgent = view.rows.some((n) => n.kind === "risk" && !n.leaving);

  return (
    <div
      className="chat-agent-anchor v3c-anchor"
      data-agent-anchor
      style={{ right: 20, width: frame.w, height: frame.h }}
    >
      {(["pill", "island", "panel"] as const).map((s) => {
        const size = s === "pill" ? pill : s === "island" ? islandSize : panel;
        return (
          <span
            key={s}
            aria-hidden="true"
            className={`v3c-shade is-${s}${state === s ? " is-on" : ""}`}
            style={{ width: size.w, height: size.h, borderRadius: size.r }}
          />
        );
      })}
      <div
        className="chat-box v3c-shell"
        data-corner={state}
        data-assistant-avoid
        style={{
          width: frame.w,
          height: frame.h,
          clipPath: cornerClip(shape, frame),
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            refocus.current = true;
            setOpen(false);
          }
        }}
      >
        <div
          className={`v3c-layer${state === "pill" ? " is-on" : ""}`}
          style={{ width: pill.w, height: pill.h }}
          inert={state !== "pill" || undefined}
        >
          <button
            ref={pillRef}
            type="button"
            data-agent-home
            data-chat-pill
            className="chat-pill chat-agent-home base-row"
            aria-label="Ask Needt (⌘J)"
            onClick={() => setOpen(true)}
          >
            <AiOrb size={20} active={ask.phase !== "idle" && !open} />
            <span className="chat-span">Ask Needt</span>
            <span className="chat-grid">⌘J</span>
          </button>
        </div>

        <div
          className={`v3c-layer v3c-island${state === "island" ? " is-on" : ""}`}
          style={{ width: islandSize.w, height: islandSize.h }}
          ref={islandRef}
          inert={state !== "island" || undefined}
          role="region"
          aria-label="Needt notifications"
          aria-live={urgent ? "assertive" : "polite"}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            const next = e.relatedTarget;
            if (!(next instanceof Node && e.currentTarget.contains(next))) {
              setFocused(false);
            }
          }}
        >
          {counted ? <div className="v3c-count">{counted}</div> : null}
          {view.rows.map((n) => (
            <IslandRow key={n.id} notice={n} onAct={act} onClose={dismiss} />
          ))}
        </div>

        {panelShown ? (
          <div
            className={`v3c-layer v3c-panel${open ? " is-on" : ""}`}
            style={{ width: panel.w, height: panel.h }}
            inert={!open || undefined}
            role="dialog"
            aria-label="Ask Needt"
            data-chat-panel
          >
            <ChatPanel
              messages={ask.messages}
              phase={ask.phase}
              onSend={(line, confirmed) => void ask.send(line, confirmed)}
              onStop={ask.stop}
              onNew={ask.reset}
              onClose={() => setOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Mounted once by V3Shell, inside the `.needt-v3` scope. */
export function AskCorner() {
  return (
    <NeedtNoticeProvider>
      <Sink />
      <Corner />
    </NeedtNoticeProvider>
  );
}
