"use client";

/* THE CORNER (v3) — Ask Needt, the notifications island, the nudge tip.
 *
 * Bottom-right is the one place this product speaks from. Closed it is the
 * pill; when something happened it grows into the island and carries the
 * notice (Undo included). Pill → island is ONE element: it is laid out at the
 * larger size and the visible shape is a clip-path anchored bottom-right
 * (`cornerClip`), so the change of size is a clip, never a width/height
 * animation. The island is never a toast — no second object arrives beside
 * the pill.
 *
 * Open, Ask Needt is not in the corner any more: it is a full-height panel
 * docked on the right (the shell's `data-chat-dock` slot, 360 px; a sheet over
 * a scrim below 1100 px), portalled into the slot so the page reflows beside
 * it. The pill steps away while it is open.
 *
 * The tip is what the nudge job noticed ("2 hours opened up"): a painted-sky
 * card above the pill that never changes the pill's size. Its button does the
 * real thing (the scheduler's preview → apply, with Undo through the island).
 *
 * Notices come from the `notify` facade (src/lib/notifications.ts) through
 * the bridge in needt/corner; this mounts the sink for the v3 frame, where the
 * old AppShell's <NeedtNotices> does not exist. Hovering the island, focus
 * inside it, or having the panel open holds the dismiss clocks.
 */
import * as React from "react";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

import { createPortal } from "react-dom";
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
} from "@/lib/assistant-position";
import { newDate } from "@/lib/date-utils";
import {
  useFillFreeTime,
  useIncomingNudges,
  useMarkNudgesRead,
} from "@/lib/needt3/hooks/nudges";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useExit } from "../ctx/useExit";
import { agentBusy } from "../cursor/hand";
import { AiOrb } from "../orb/AiOrb";
import { usePaywallStore } from "../paywall/store";
import { useShellApi } from "../shell/ShellContext";
import { useAsk } from "./AskProvider";
import { ChatPanel } from "./ChatPanel";
import { NudgeTip } from "./NudgeTip";
import { useChatDock } from "./dock";
import { hiddenLabel, islandHasRows, islandView, primaryAct } from "./island";
import {
  TIP_AUTO_MS,
  TIP_MIN_LEFT_MS,
  type TipNote,
  mayShowTip,
  noteFromNudge,
  quietPlace,
} from "./nudge-tip";
import { firstName } from "./scope";

/** The dock card's exit (chat.css v3-chat-spring-out 200ms, +20ms slack). */
const PANEL_EXIT_MS = 220;

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
  const { ask, asking } = useAsk();
  const { narrow } = useShellApi();
  const dock = useChatDock();
  const session = useSession();
  const pathname = usePathname();
  const settingsOpen = useNeedt3Ui((s) => s.settingsOpen);
  const paletteOpen = useNeedt3Ui((s) => s.paletteOpen);
  const composerOpen = useNeedt3Ui((s) => s.composerOpen);
  const paywallOpen = usePaywallStore((s) => s.open);
  const [hovering, setHovering] = React.useState(false);
  /* Keyboard focus inside the island, kept apart from the mouse so a mouse
     leaving does not drop a held focus and a focus leaving does not drop a
     hover. */
  const [focused, setFocused] = React.useState(false);
  /* A notice's question, waiting for the reply in flight to finish. */
  const [queued, setQueued] = React.useState<string | null>(null);
  const [panelShown, panelLeaving] = useExit(open, PANEL_EXIT_MS);
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
  const frame = cornerFrame(pill, islandSize);
  const state = island ? "island" : "pill";
  const shape = state === "island" ? islandSize : pill;

  /* ---- the nudge tip ---- */
  const incoming = useIncomingNudges(true);
  const markRead = useMarkNudgesRead();
  const fillFreeTime = useFillFreeTime();
  const [tip, setTip] = React.useState<TipNote | null>(null);
  const [tipShown, tipLeaving] = useExit(tip !== null, 200);
  const lastNote = React.useRef<TipNote | null>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const [tipHold, setTipHold] = React.useState(false);
  const tipLeft = React.useRef(TIP_AUTO_MS);
  const mountedAt = React.useRef(newDate().getTime());
  const lastShownAt = React.useRef<number | null>(null);
  const quiet =
    quietPlace(pathname) ||
    settingsOpen ||
    paywallOpen ||
    paletteOpen ||
    composerOpen;
  // Rare on purpose: not while the panel is open, a notice is speaking, a tip
  // is already up, or the person is in a setup or money place.
  const tipBlocked = open || island || tip !== null || quiet;
  const queue = incoming.queue;
  const dropIncoming = incoming.drop;

  React.useEffect(() => {
    if (!queue.length) return undefined;
    const surface = () => {
      const now = newDate().getTime();
      const gate = {
        now,
        mountedAt: mountedAt.current,
        lastShownAt: lastShownAt.current,
        blocked: tipBlocked || agentBusy(),
        queued: queue.length,
      };
      if (!mayShowTip(gate)) return false;
      const next = queue[0];
      dropIncoming(next.id);
      lastShownAt.current = now;
      lastNote.current = noteFromNudge(next);
      setTip(lastNote.current);
      return true;
    };
    if (surface()) return undefined;
    const id = window.setInterval(() => {
      if (surface()) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [queue, tipBlocked, dropIncoming]);

  // Opening the panel is the end of the tip's errand.
  React.useEffect(() => {
    if (open && tip) {
      void markRead(tip.id);
      setTip(null);
    }
  }, [open, tip, markRead]);

  // Auto-dismiss after TIP_AUTO_MS; hovering or focusing the card pauses it.
  React.useEffect(() => {
    tipLeft.current = TIP_AUTO_MS;
    setTipHold(false);
  }, [tip]);
  React.useEffect(() => {
    if (!tip || tipHold) return undefined;
    const t0 = newDate().getTime();
    const id = window.setTimeout(() => setTip(null), tipLeft.current);
    return () => {
      window.clearTimeout(id);
      tipLeft.current = Math.max(
        TIP_MIN_LEFT_MS,
        tipLeft.current - (newDate().getTime() - t0)
      );
    };
  }, [tip, tipHold]);

  // The States pill and every scroll area lift clear of the tip while it is up.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    if (!tipShown || tipLeaving || !tipRef.current) {
      root.style.removeProperty("--chat-tip-lift");
      return undefined;
    }
    root.style.setProperty(
      "--chat-tip-lift",
      `${Math.ceil(tipRef.current.offsetHeight + 12)}px`
    );
    return () => {
      root.style.removeProperty("--chat-tip-lift");
    };
  }, [tipShown, tipLeaving, tip]);

  const closeTip = (note: TipNote) => {
    setTip(null);
    void markRead(note.id);
  };
  const actTip = (note: TipNote) => {
    closeTip(note);
    if (note.act.kind === "fill") void fillFreeTime();
    else router.push(note.act.href);
  };

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

  /* Where the panel lives. Wide window: a 360 px column of the shell's main
     row (the shell animates the slot's width). Narrow: a sheet on the right
     over a scrim. Escape closes it and hands the focus back to the pill. */
  const close = () => {
    refocus.current = true;
    setOpen(false);
  };
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  const panel = (
    <ChatPanel
      messages={ask.messages}
      phase={ask.phase}
      scope={asking.scope}
      scopes={asking.list}
      onScope={asking.setPick}
      name={firstName(session.data?.user?.name)}
      onSend={(line, confirmed, shown) => void ask.send(line, confirmed, shown)}
      onStop={ask.stop}
      onNew={ask.reset}
      onClose={() => setOpen(false)}
      onPopLast={ask.popLast}
    />
  );
  const panelFrame = narrow ? (
    <>
      <div
        className={`chat-frame-layer chat-scrim${panelLeaving ? " is-leaving" : ""}`}
        aria-hidden="true"
        onMouseDown={() => setOpen(false)}
      />
      <div
        className={`chat-box chat-sheet${panelLeaving ? " is-leaving" : ""}`}
        role="dialog"
        aria-label="Ask Needt"
        data-chat-panel
        data-assistant-avoid
        inert={!open || undefined}
        onKeyDown={onPanelKey}
      >
        {panel}
      </div>
    </>
  ) : (
    <div
      className="chat-frame-panel"
      data-chat-panel
      data-assistant-avoid
      role="complementary"
      aria-label="Ask Needt"
      inert={!open || undefined}
      onKeyDown={onPanelKey}
    >
      <div
        className={`chat-box chat-dock-card${panelLeaving ? " is-leaving" : ""}`}
      >
        {panel}
      </div>
    </div>
  );

  return (
    <div
      className="chat-agent-anchor v3c-anchor"
      data-agent-anchor
      style={{ right: 20, width: frame.w, height: frame.h }}
    >
      {tipShown && lastNote.current && !open && state === "pill" ? (
        <NudgeTip
          ref={tipRef}
          note={lastNote.current}
          leaving={tipLeaving}
          onHold={setTipHold}
          onAct={() => actTip(lastNote.current as TipNote)}
          onDismiss={() => closeTip(lastNote.current as TipNote)}
          onOpen={() => {
            closeTip(lastNote.current as TipNote);
            setOpen(true);
          }}
        />
      ) : null}
      {(["pill", "island"] as const).map((s) => {
        const size = s === "pill" ? pill : islandSize;
        return (
          <span
            key={s}
            aria-hidden="true"
            className={`v3c-shade is-${s}${!open && state === s ? " is-on" : ""}`}
            style={{ width: size.w, height: size.h, borderRadius: size.r }}
          />
        );
      })}
      <div
        className="chat-box v3c-shell"
        data-corner={open ? "away" : state}
        data-assistant-avoid
        style={{
          width: frame.w,
          height: frame.h,
          clipPath: cornerClip(shape, frame),
        }}
      >
        <div
          className={`v3c-layer${state === "pill" && !open ? " is-on" : ""}`}
          style={{ width: pill.w, height: pill.h }}
          inert={state !== "pill" || open || undefined}
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
          inert={state !== "island" || open || undefined}
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
      </div>
      {panelShown && dock ? createPortal(panelFrame, dock) : null}
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
