"use client";

import {
  type HTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ProjectLike } from "@/lib/needt3/derive";

import { useExit } from "../ctx/useExit";
import type { DragProps } from "../drag/useDrag";
import { Task } from "../task/Task";
import type { CalItem, CalTimed } from "./blocks";
import {
  C2_CAP,
  C2_H,
  C2_MIN_H,
  type CalDay,
  type Placed,
  c2Place,
  c2PosStyle,
  c2Time,
  slotAt,
} from "./layout";
import {
  type Anchor,
  MoreChip,
  POP_EXIT_MS,
  Peek,
  SlotPop,
  anchorOf,
  useSlot,
} from "./popovers";

const GUTTER = 56;

export interface Draft {
  date: string;
  at: number;
  key: number;
}

type DraftBlock = CalTimed & { draft: true };

/** The draft: an empty block where you clicked, its title typed in place. */
function DraftBlock({
  d,
  pos,
  start,
  onSave,
  onCancel,
}: {
  d: Draft;
  pos: Placed<CalTimed>;
  start: number;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [d.date, d.at]);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    if (keep && title.trim()) onSave(title.trim());
    else onCancel();
  };
  return (
    <div
      className="nx-pop c2-draft"
      data-c2-block="draft"
      onClick={(e) => e.stopPropagation()}
      style={{
        ...c2PosStyle(pos),
        top: (d.at - start) * C2_H + 1,
        height: C2_H - 3,
      }}
    >
      <span aria-hidden="true" className="c2-draft-rail" />
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New event"
        aria-label="Event title"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
        className="c2-draft-input"
      />
      <div className="c2-meta">
        {c2Time(d.at)}–{c2Time(d.at + 1)}
      </div>
    </div>
  );
}

interface Hover {
  open?: (id: string) => void;
  enter: (b: CalItem, el: HTMLElement) => void;
  leave: () => void;
  click: (b: CalItem, el: HTMLElement) => void;
  focus: (b: CalItem, el: HTMLElement) => void;
}

/** A block on the grid: placed here, drawn by `<Task layout="block">`. */
function Block({
  b,
  pos,
  start,
  peek,
  hover,
  dragProps,
}: {
  b: CalTimed;
  pos: Placed<CalTimed>;
  start: number;
  peek: boolean;
  hover: Hover;
  dragProps?: DragProps;
}) {
  const [hot, setHot] = useState(false);
  const lit = hot || peek;
  const top = (b.at - start) * C2_H;
  const h = Math.max((b.len / 60) * C2_H - 3, C2_MIN_H);
  const place =
    lit && pos.split ? { left: 4 + (pos.base ?? 0), width: pos.full } : pos;
  const range = `${c2Time(b.at)}–${c2Time(b.at + b.len / 60)}`;
  const events = {
    "data-c2-block": b.id,
    tabIndex: 0,
    role: "button",
    "aria-label": `${b.title}, ${range}`,
    "aria-expanded": peek,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      hover.click(b, e.currentTarget);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) =>
      hover.focus(b, e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (!b.event && hover.open) hover.open(b.id);
      else hover.click(b, e.currentTarget);
    },
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      setHot(true);
      hover.enter(b, e.currentTarget);
    },
    onMouseLeave: () => {
      setHot(false);
      hover.leave();
    },
    ...(!b.event && dragProps
      ? dragProps({ id: b.id, title: b.title }, "move")
      : {}),
  } as HTMLAttributes<HTMLDivElement>;
  return (
    <Task
      layout="block"
      task={b.entry}
      lit={lit}
      selected={peek}
      box={{
        h,
        w: pos.width || 999,
        padTop: pos.padTop || 0,
        tight: !!pos.split && !lit,
        cascade: pos.cascade,
      }}
      className="c2-block"
      style={{
        ...c2PosStyle(place),
        zIndex: lit ? 40 : pos.z || 2,
        top: top + 1,
        height: h,
      }}
      events={events}
    />
  );
}

export interface WeekViewProps {
  days: readonly CalDay[];
  blocks: readonly CalTimed[];
  today: string;
  /** The clock's decimal hour today, for the now line. */
  nowHour: number | null;
  start: number;
  end: number;
  projects?: readonly ProjectLike[];
  draft: Draft | null;
  onSlot: (date: string, at: number) => void;
  onSave: (title: string) => void;
  onCancel: () => void;
  onOpen?: (id: string) => void;
  onDone: (b: CalItem) => void;
  onRename: (b: CalItem, title: string) => void;
  onDelete: (b: CalItem) => void;
  dragProps?: DragProps;
}

/** Week (and 3-day) grid: seven columns by the hour ($P/calendar2.jsx `WeekView`). */
export function WeekView({
  days,
  blocks,
  today,
  nowHour,
  start,
  end,
  projects,
  draft,
  onSlot,
  onSave,
  onCancel,
  onOpen,
  onDone,
  onRename,
  onDelete,
  dragProps,
}: WeekViewProps) {
  const N = days.length;
  const hours: number[] = [];
  for (let h = start; h < end; h++) hours.push(h);
  const scroller = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(0);
  const [peek, setPeek] = useState<{ id: string; rect: Anchor } | null>(null);
  const last = useRef(peek);
  if (peek) last.current = peek;
  const [shown, leaving] = useExit(!!peek, POP_EXIT_MS);
  const tOpen = useRef(0);
  const tClose = useRef(0);
  const quiet = useRef(false);
  const peekRef = useRef(peek);
  peekRef.current = peek;

  const clear = () => {
    window.clearTimeout(tOpen.current);
    window.clearTimeout(tClose.current);
  };
  const show = (b: CalItem, el: HTMLElement) => {
    clear();
    setPeek({ id: b.id, rect: anchorOf(el) });
  };
  const close = useCallback((refocus: boolean) => {
    window.clearTimeout(tOpen.current);
    window.clearTimeout(tClose.current);
    const p = last.current;
    setPeek(null);
    if (refocus && p) {
      const el = scroller.current?.querySelector<HTMLElement>(
        `[data-c2-block="${CSS.escape(p.id)}"]`
      );
      if (el) {
        quiet.current = true;
        el.focus({ preventScroll: true });
        quiet.current = false;
      }
    }
  }, []);
  const hover: Hover = {
    open: onOpen,
    enter: (b, el) => {
      clear();
      const cur = peekRef.current;
      if (cur && cur.id === b.id) return;
      tOpen.current = window.setTimeout(() => show(b, el), cur ? 120 : 350);
    },
    leave: () => {
      clear();
      tClose.current = window.setTimeout(() => setPeek(null), 150);
    },
    click: (b, el) => show(b, el),
    focus: (b, el) => {
      if (quiet.current) return;
      let fv = false;
      try {
        fv = el.matches(":focus-visible");
      } catch {
        /* old engines */
      }
      if (fv) show(b, el);
    },
  };
  useEffect(() => () => clear(), []);
  const peekId = peek?.id ?? null;
  useEffect(() => {
    if (!peekId) return undefined;
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (
        t?.closest?.("[data-c2-peek]") ||
        t?.closest?.(`[data-c2-block="${CSS.escape(peekId)}"]`)
      )
        return;
      close(false);
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (e.key !== "Escape" || t?.getAttribute?.("data-c2-edit")) return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const sc = () => close(false);
    const s = scroller.current;
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    s?.addEventListener("scroll", sc, { passive: true });
    window.addEventListener("resize", sc);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
      s?.removeEventListener("scroll", sc);
      window.removeEventListener("resize", sc);
    };
  }, [peekId, close]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = (8.5 - start) * C2_H;
    // first paint only: paging keeps the person's scroll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* One ResizeObserver on the grid container (PORT.md §5.3), never one per
     block; its entry carries the width, so nothing is measured by hand. */
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(0, (entry.contentRect.width - GUTTER) / N);
      setColW((cur) => (Math.abs(cur - w) < 0.5 ? cur : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [N]);

  const pb =
    shown && last.current
      ? (blocks.find((x) => x.id === last.current?.id) ?? null)
      : null;
  const sl = useSlot();
  /* A row in the slot list opens like the block would: a task its dialog,
     an event its peek. */
  const pickSlot = (b: CalTimed, el: HTMLElement) => {
    const r = anchorOf(el);
    sl.close(false);
    if (!b.event && onOpen) onOpen(b.id);
    else {
      clear();
      setPeek({ id: b.id, rect: r });
    }
  };
  const cols = `${GUTTER}px repeat(${N}, minmax(0, 1fr))`;

  return (
    <div className="c2-week">
      <div className="c2-week-head" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => (
          <div
            key={d.date}
            className={`c2-dayhead${d.date === today ? " is-today" : ""}`}
          >
            <span className="c2-dayhead-wd">{d.wd}</span>
            <span className="c2-dayhead-n">{d.n}</span>
          </div>
        ))}
      </div>
      <div ref={scroller} className="scroll-inner c2-week-scroll">
        <div
          ref={gridRef}
          className="c2-week-grid"
          style={{
            gridTemplateColumns: cols,
            height: (end - start) * C2_H,
          }}
        >
          <div className="c2-rel">
            {hours.map((h) => (
              <span
                key={h}
                className="c2-hour"
                style={{ top: (h - start) * C2_H - 7 }}
              >
                {h === start ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const mine: CalTimed[] = blocks.filter((b) => b.date === d.date);
            if (draft && draft.date === d.date)
              mine.push({
                id: "__draft",
                date: d.date,
                at: draft.at,
                len: 60,
                title: "",
                draft: true,
                entry: {
                  kind: "event",
                  id: "__draft",
                  title: "",
                  startAt: "",
                  endAt: "",
                },
              } as DraftBlock);
            const laid = c2Place(mine, colW, C2_CAP);
            return (
              /* Each day column is a drop target (data-drop="timeline"): a
                 task dropped here takes this day and the 15-min slot under
                 the hand; its new block (data-drag-id) is where it lands. */
              <div
                key={d.date}
                data-c2-day={d.date}
                data-drop="timeline"
                data-date={d.date}
                data-start={start}
                data-hour-h={C2_H}
                data-offset="0"
                onClick={(e) => {
                  if ((e.target as Element).closest("[data-c2-block]")) return;
                  const y =
                    e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onSlot(d.date, slotAt(y, start, end));
                }}
                className={`c2-daycol${d.date === today ? " is-today" : d.weekend ? " is-weekend" : ""}`}
              >
                {hours.map((h) => (
                  <span
                    key={h}
                    aria-hidden="true"
                    className="c2-hline"
                    style={{ top: (h - start) * C2_H }}
                  />
                ))}
                {laid.placed.map((pos) =>
                  pos.b.draft && draft ? (
                    <DraftBlock
                      key={`draft-${draft.key}`}
                      d={draft}
                      pos={pos}
                      start={start}
                      onSave={onSave}
                      onCancel={onCancel}
                    />
                  ) : (
                    <Block
                      key={pos.b.id}
                      b={pos.b}
                      pos={pos}
                      start={start}
                      hover={hover}
                      peek={!!peek && peek.id === pos.b.id}
                      dragProps={dragProps}
                    />
                  )
                )}
                {laid.more.map((m) => (
                  <MoreChip
                    key={m.key}
                    m={m}
                    onPick={sl.open}
                    on={!!sl.slot && !sl.leaving && sl.slot.m.key === m.key}
                    style={{
                      left: m.left,
                      width: m.width,
                      top: (m.at - start) * C2_H + 2,
                    }}
                  />
                ))}
                {d.date === today &&
                nowHour != null &&
                nowHour >= start &&
                nowHour <= end ? (
                  <span
                    aria-hidden="true"
                    className="c2-now"
                    style={{ top: (nowHour - start) * C2_H }}
                  >
                    <span className="c2-now-dot" />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {sl.slot ? (
        <SlotPop
          key={sl.slot.m.key}
          m={sl.slot.m}
          rect={sl.slot.rect}
          kbd={sl.slot.kbd}
          leaving={sl.leaving}
          projects={projects}
          today={today}
          onPick={pickSlot}
          onClose={sl.close}
        />
      ) : null}
      {pb && last.current ? (
        <Peek
          key={pb.id}
          b={pb}
          rect={last.current.rect}
          leaving={leaving}
          projects={projects}
          today={today}
          onEnter={() => window.clearTimeout(tClose.current)}
          onLeave={hover.leave}
          onClose={() => close(false)}
          onOpen={onOpen}
          onDone={onDone}
          onRename={onRename}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}
