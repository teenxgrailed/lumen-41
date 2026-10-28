"use client";

import {
  type HTMLAttributes,
  type Ref,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type ProjectLike, weekday } from "@/lib/needt3/derive";
import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import { useExit } from "../ctx/useExit";
import { PERSONAL_DRAG_PREFIX, bandIsDraggable } from "../drag/personal-drop";
import type { DragProps } from "../drag/useDrag";
import type { ResizeProps } from "../drag/usePersonalResize";
import { PersonalBand } from "../personal/PersonalBand";
import { Task } from "../task/Task";
import {
  CreateCard,
  type CreateKind,
  type CreateSpec,
  type WritableCalendar,
} from "./CreateCard";
import type { CalItem, CalTimed } from "./blocks";
import {
  C2_CAP,
  C2_H,
  C2_MIN_H,
  type Placed,
  c2Place,
  c2PosStyle,
  c2Time,
  calDay,
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
import {
  STRIP_SPAN,
  type WorkHours,
  columnWidth,
  drawnRange,
  glidePlan,
  jumpGoal,
  nearestIndex,
  nowScrollTop,
  offHours,
  offsetOf,
  stripDate,
  stripIndex,
} from "./strip";

export const GUTTER = 56;
/** The grid is the whole day: 00:00 to 24:00. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GRID_H = 24 * C2_H;
/** How long a still scroller waits before settling onto a day column. */
const SETTLE_MS = 110;
/** A wheel gesture ends after this long without an event. */
const WHEEL_IDLE_MS = 180;
const NONE: readonly CalTimed[] = [];

export interface Draft {
  date: string;
  /** Start, decimal hours. */
  at: number;
  /** End, decimal hours: set when the range was drawn; a click is an hour. */
  end?: number;
  /** What the card makes; the person's last choice when absent. */
  kind?: CreateKind;
  key: number;
}

export const draftEnd = (d: Pick<Draft, "at" | "end">) =>
  d.end ?? Math.min(24, d.at + 1);

type DraftBlock = CalTimed & { draft: true };

/** A press that travels this far is a range being drawn, not a click. */
const DRAW_PX = 5;
/**
 * The creation preview (the ghost while drawing, the draft once drawn) sits
 * between the hour lines: a line is the 1px at the top of its hour, so the
 * preview starts 2px below it and stops 1px short of the next one, one clear
 * pixel on each side. Both share it so letting go does not move the block.
 */
const PREVIEW_TOP = 2;
const PREVIEW_CUT = 3;
/** A quarter hour of the grid. */
const QUARTER_H = C2_H / 4;

/** The quarter hour at `y` px down a day column, 0–24. */
export function quarterAt(y: number, round: "floor" | "round" = "round") {
  const q =
    round === "floor" ? Math.floor(y / QUARTER_H) : Math.round(y / QUARTER_H);
  return Math.min(Math.max(q / 4, 0), 24);
}

/** A drawn range from the press and the pointer, at least a quarter hour. */
export function drawnSpan(fromY: number, toY: number) {
  const a = quarterAt(Math.min(fromY, toY), "floor");
  let b = quarterAt(Math.max(fromY, toY), "round");
  if (b - a < 0.25) b = Math.min(24, a + 0.25);
  return { at: Math.min(a, 23.75), end: b };
}

const spanText = (at: number, end: number) => `${c2Time(at)}–${c2Time(end)}`;

/** Card props the draft passes through from the screen. */
interface DraftCard {
  kind: CreateKind;
  onKind: (k: CreateKind) => void;
  onRange: (at: number, end: number) => void;
  onCreate: (spec: CreateSpec) => void;
  onCancel: () => void;
  projects?: readonly ProjectLike[];
  calendars?: readonly WritableCalendar[];
}

/** The draft: a ghost block over the chosen range, its create card beside it. */
function DraftBlock({
  d,
  pos,
  start,
  card,
}: {
  d: Draft;
  pos: Placed<CalTimed>;
  start: number;
  card: DraftCard;
}) {
  const box = useRef<HTMLDivElement>(null);
  const end = draftEnd(d);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [d.date, d.at]);
  return (
    <div
      ref={box}
      className="c2-draft"
      data-c2-block="draft"
      onClick={(e) => e.stopPropagation()}
      style={{
        ...c2PosStyle(pos),
        top: (d.at - start) * C2_H + PREVIEW_TOP,
        height: Math.max((end - d.at) * C2_H - PREVIEW_CUT, C2_MIN_H),
      }}
    >
      <span aria-hidden="true" className="c2-draft-rail" />
      <div className="c2-meta" data-c2-draft-time="">
        {spanText(d.at, end)}
      </div>
      <CreateCard
        anchor={box}
        date={d.date}
        at={d.at}
        end={end}
        sized={d.end != null}
        kind={d.kind ?? card.kind}
        onKind={card.onKind}
        onRange={card.onRange}
        projects={card.projects}
        calendars={card.calendars}
        onCreate={card.onCreate}
        onCancel={card.onCancel}
      />
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

/** What the parent can ask of the strip. */
export interface WeekHandle {
  /** Glide `days` days from where the strip is heading (or stands). */
  jump: (days: number) => void;
  /** Glide to a day, which becomes the first column. */
  goTo: (date: string) => void;
}

export interface WeekViewProps {
  /** Columns in view: 7, or 3 on a narrow window. */
  n: number;
  /** The day that is the first column when the view opens. */
  initial: string;
  /** Timed blocks by day ("YYYY-MM-DD"). */
  blocks: ReadonlyMap<string, readonly CalTimed[]>;
  /** The clock's decimal hour today, for the now line. */
  nowHour: number | null;
  today: string;
  /** Hours the person works; the rest of the grid is shaded. */
  work?: WorkHours | null;
  projects?: readonly ProjectLike[];
  draft: Draft | null;
  /** A click (an hour from the half hour) or a drawn range on a day. */
  onSlot: (date: string, at: number, end?: number) => void;
  /** The draft's card made something. */
  onCreate: (spec: CreateSpec) => void;
  /** The draft's range or type changed in its card. */
  onDraft?: (patch: Partial<Pick<Draft, "at" | "end" | "kind">>) => void;
  onCancel: () => void;
  /** The type the card opens on when the draft names none. */
  createKind?: CreateKind;
  /** Calendars an event can be written to. */
  calendars?: readonly WritableCalendar[];
  onOpen?: (id: string) => void;
  onDone: (b: CalItem) => void;
  onRename: (b: CalItem, title: string) => void;
  onDelete: (b: CalItem) => void;
  dragProps?: DragProps;
  /** The bottom-edge handle of a personal time band (the drag host's). */
  resizeProps?: ResizeProps;
  /** Personal time by day (usePersonalBands): drawn as quiet bands behind the blocks. */
  personal?: ReadonlyMap<string, readonly DayBand[]>;
  onPersonal?: (band: DayBand, el: HTMLElement) => void;
  /** "Personal time" on an event's peek. */
  onMarkPersonal?: (b: CalItem) => void;
  /** The first column in view changed (also once on mount). */
  onFirst?: (date: string) => void;
  /** The strip came to rest on a day column. */
  onSettle?: (date: string) => void;
  handle?: Ref<WeekHandle>;
}

const calm = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

interface ColumnProps {
  date: string;
  x: number;
  w: number;
  isToday: boolean;
  mine: readonly CalTimed[];
  draft: Draft | null;
  nowHour: number | null;
  work?: WorkHours | null;
  peekId: string | null;
  hover: Hover;
  dragProps?: DragProps;
  resizeProps?: ResizeProps;
  bands?: readonly DayBand[];
  onBand?: (band: DayBand, el: HTMLElement) => void;
  onSlot: (date: string, at: number, end?: number) => void;
  card: DraftCard;
  onMore: ReturnType<typeof useSlot>["open"];
  moreKey: string | null;
}

/** One day: its off-hours shading, hour lines, blocks and now line. */
const DayColumn = memo(function DayColumn({
  date,
  x,
  w,
  isToday,
  mine,
  draft,
  nowHour,
  work,
  peekId,
  hover,
  dragProps,
  resizeProps,
  bands,
  onBand,
  onSlot,
  card,
  onMore,
  moreKey,
}: ColumnProps) {
  const off = useMemo(() => offHours(weekday(date), work), [date, work]);
  /* Press and drag down a day to draw a range (quarter hours, its time shown
     live); let go and the create card opens on it. A press that does not
     travel is a click: an hour from the half hour under it. */
  const press = useRef<{ id: number; y: number; top: number } | null>(null);
  const [drawing, setDrawing] = useState<{ at: number; end: number } | null>(
    null
  );
  const yOf = (e: React.PointerEvent<HTMLElement>, top: number) =>
    e.clientY - top;
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const t = e.target as Element;
    if (
      t.closest(
        "[data-c2-block], [data-personal-band], button, a, input, [role='button']"
      )
    )
      return;
    const top = e.currentTarget.getBoundingClientRect().top;
    press.current = { id: e.pointerId, y: yOf(e, top), top };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const y = yOf(e, p.top);
    if (!drawing && Math.abs(y - p.y) < DRAW_PX) return;
    e.preventDefault();
    const next = drawnSpan(p.y, Math.min(Math.max(y, 0), 24 * C2_H));
    setDrawing((cur) =>
      cur && cur.at === next.at && cur.end === next.end ? cur : next
    );
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    const span = drawing;
    setDrawing(null);
    if (span) onSlot(date, span.at, span.end);
    else onSlot(date, slotAt(p.y, 0, 24));
  };
  const onPointerCancel = () => {
    press.current = null;
    setDrawing(null);
  };
  const laid = useMemo(() => {
    const list: CalTimed[] = [...mine];
    if (draft)
      list.push({
        id: "__draft",
        date,
        at: draft.at,
        len: Math.round((draftEnd(draft) - draft.at) * 60),
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
    return c2Place(list, w, C2_CAP);
  }, [mine, draft, date, w]);
  return (
    /* Each day column is a drop target (data-drop="timeline"): a task dropped
       here takes this day and the 15-min slot under the hand; its new block
       (data-drag-id) is where it lands. */
    <div
      data-c2-day={date}
      data-drop="timeline"
      data-date={date}
      data-start={0}
      data-hour-h={C2_H}
      data-offset="0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`c2-daycol${isToday ? " is-today" : ""}${drawing ? " is-drawing" : ""}`}
      style={{ width: w, transform: `translate3d(${x}px,0,0)` }}
    >
      {off.map(([a, b]) => (
        <span
          key={a}
          aria-hidden="true"
          className="c2-off"
          style={{ top: a * C2_H, height: (b - a) * C2_H }}
        />
      ))}
      {/* personal time: a quiet stripe behind everything, edge to edge */}
      {bands?.map((band) => (
        <PersonalBand
          key={band.key}
          variant="grid"
          blockId={band.blockId}
          title={band.title}
          emoji={band.emoji}
          tone={band.tone}
          time={bandTimeLabel(band)}
          repeating={band.repeating}
          linked={band.linked}
          compact={(band.to - band.from) * C2_H < 24}
          style={{
            top: band.from * C2_H,
            height: (band.to - band.from) * C2_H,
          }}
          /* a block of its own can be picked up and moved, and pulled by its
             end (not the slice that stops at midnight); one marked on an
             event follows the event and stays put */
          drag={
            bandIsDraggable(band) && dragProps
              ? dragProps(
                  {
                    id: `${PERSONAL_DRAG_PREFIX}${band.blockId}`,
                    title: band.title,
                  },
                  "move"
                )
              : undefined
          }
          onResize={
            bandIsDraggable(band) && resizeProps && band.to < 24
              ? resizeProps({ blockId: band.blockId, hourH: C2_H })
                  .onPointerDown
              : undefined
          }
          onOpen={(e) => {
            e.stopPropagation();
            onBand?.(band, e.currentTarget);
          }}
        />
      ))}
      {/* the 24 hour lines are one gradient, not 24 nodes per column */}
      <span aria-hidden="true" className="c2-hlines" />
      {laid.placed.map((pos) =>
        pos.b.draft && draft ? (
          <DraftBlock
            key={`draft-${draft.key}`}
            d={draft}
            pos={pos}
            start={0}
            card={card}
          />
        ) : (
          <Block
            key={pos.b.id}
            b={pos.b}
            pos={pos}
            start={0}
            hover={hover}
            peek={peekId === pos.b.id}
            dragProps={dragProps}
          />
        )
      )}
      {laid.more.map((m) => (
        <MoreChip
          key={m.key}
          m={m}
          onPick={onMore}
          on={moreKey === m.key}
          style={{ left: m.left, width: m.width, top: m.at * C2_H + 2 }}
        />
      ))}
      {drawing ? (
        <div
          aria-hidden="true"
          className="c2-select"
          data-c2-select=""
          style={{
            top: drawing.at * C2_H + PREVIEW_TOP,
            height: Math.max(
              (drawing.end - drawing.at) * C2_H - PREVIEW_CUT,
              C2_MIN_H
            ),
          }}
        >
          <span className="c2-select-time">
            {spanText(drawing.at, drawing.end)}
          </span>
        </div>
      ) : null}
      {isToday && nowHour != null ? (
        <span
          aria-hidden="true"
          className="c2-now"
          style={{ top: nowHour * C2_H }}
        >
          <span className="c2-now-dot" />
        </span>
      ) : null}
    </div>
  );
});

/** The block a peek is on, looked up fresh so a rename shows. */
function findBlock(
  blocks: ReadonlyMap<string, readonly CalTimed[]>,
  id: string
) {
  for (const list of blocks.values()) {
    const hit = list.find((b) => b.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * The week grid: an endless strip of day columns, all 24 hours, scrolled
 * sideways a day at a time ($P/calendar2.jsx `WeekView`, then Notion
 * Calendar's feel).
 *
 * One scroller holds both axes; the hour gutter and the day heads stick to
 * its edges. Columns are placed once with a transform and never move while
 * the strip scrolls (the browser scrolls them on the compositor); a scroll
 * handler reads `scrollLeft` once a frame and only when the first visible
 * day changes does React draw different columns. A scroller that stops
 * between two days settles onto the nearest one. The grid never calls
 * `getBoundingClientRect` on scroll, and observes its container once
 * (PORT.md §8), never a card.
 */
export function WeekView({
  n,
  initial,
  blocks,
  nowHour,
  today,
  work,
  projects,
  draft,
  onSlot,
  onCreate,
  onDraft,
  onCancel,
  createKind = "event",
  calendars,
  onOpen,
  onDone,
  onRename,
  onDelete,
  dragProps,
  resizeProps,
  personal,
  onPersonal,
  onMarkPersonal,
  onFirst,
  onSettle,
  handle,
}: WeekViewProps) {
  /* The strip's index 0 is fixed on the first render: days are counted from
     here, so a later "today" never shifts a column. */
  const origin = useRef(initial);
  const scroller = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(0);
  const colRef = useRef(0);
  const firstRef = useRef(stripIndex(origin.current, initial));
  const [first, setFirst] = useState(firstRef.current);
  const goal = useRef<number | null>(null);
  const frame = useRef(0);
  const idle = useRef(0);
  const pressed = useRef(false);
  const cbs = useRef({
    onFirst,
    onSettle,
    onOpen,
    onSlot,
    onCreate,
    onDraft,
    onCancel,
  });
  cbs.current = {
    onFirst,
    onSettle,
    onOpen,
    onSlot,
    onCreate,
    onDraft,
    onCancel,
  };

  const [peek, setPeek] = useState<{ id: string; rect: Anchor } | null>(null);
  const last = useRef(peek);
  if (peek) last.current = peek;
  const [shown, leaving] = useExit(!!peek, POP_EXIT_MS);
  const tOpen = useRef(0);
  const tClose = useRef(0);
  const quiet = useRef(false);
  const peekRef = useRef(peek);
  peekRef.current = peek;

  const clear = useCallback(() => {
    window.clearTimeout(tOpen.current);
    window.clearTimeout(tClose.current);
  }, []);
  const show = useCallback(
    (b: CalItem, el: HTMLElement) => {
      clear();
      setPeek({ id: b.id, rect: anchorOf(el) });
    },
    [clear]
  );
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
  /* One stable object: the columns are memoised on it. */
  const hover = useMemo<Hover>(
    () => ({
      open: (id) => cbs.current.onOpen?.(id),
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
    }),
    [clear, show]
  );
  useEffect(() => () => clear(), [clear]);
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

  /* ---- the strip ---- */
  const place = useCallback((i: number) => {
    firstRef.current = i;
    setFirst(i);
    cbs.current.onFirst?.(stripDate(origin.current, i));
  }, []);

  /* Measure on mount and let the one observer keep it. The first measure also
     sets the opening position: the day to open on, and now a third down. */
  const ready = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const apply = (viewport: number) => {
      const w = columnWidth(viewport, GUTTER, n);
      if (Math.abs(w - colRef.current) < 0.5) return;
      colRef.current = w;
      setColW(w);
      if (!ready.current) {
        ready.current = true;
        el.scrollTop = nowScrollTop(
          nowHour ?? 8.5,
          C2_H,
          el.clientHeight,
          GRID_H
        );
        cbs.current.onFirst?.(stripDate(origin.current, firstRef.current));
      }
    };
    apply(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
    // nowHour only seeds the first scroll; later minutes must not re-run it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  /* Keep the same first day when the width (or the column count) changes.
     After the commit: only then is the canvas as wide as `colW` says, and a
     scroll offset past the old width would be clamped. */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || colW <= 0) return;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = offsetOf(firstRef.current, colW);
    el.style.scrollBehavior = "";
  }, [colW]);

  const settle = useCallback(() => {
    const el = scroller.current;
    const w = colRef.current;
    if (!el || w <= 0) return;
    if (pressed.current) {
      idle.current = window.setTimeout(settle, SETTLE_MS);
      return;
    }
    const i = nearestIndex(el.scrollLeft, w);
    const want = offsetOf(i, w);
    if (Math.abs(want - el.scrollLeft) > 1.5) {
      el.scrollTo({ left: want, behavior: calm() ? "auto" : "smooth" });
      return;
    }
    goal.current = null;
    if (i !== firstRef.current) place(i);
    cbs.current.onSettle?.(stripDate(origin.current, i));
  }, [place]);

  const onScroll = useCallback(() => {
    if (!frame.current)
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0;
        const el = scroller.current;
        if (!el || colRef.current <= 0) return;
        const i = nearestIndex(el.scrollLeft, colRef.current);
        if (i !== firstRef.current) place(i);
      });
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(settle, SETTLE_MS);
  }, [place, settle]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(frame.current);
      window.clearTimeout(idle.current);
    },
    []
  );

  /* A finger or the scrollbar thumb holds the strip: do not settle under it. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.target === el) pressed.current = true;
    };
    const up = () => {
      if (!pressed.current) return;
      pressed.current = false;
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(settle, SETTLE_MS);
    };
    el.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [settle]);

  const glideTo = useCallback((i: number) => {
    const el = scroller.current;
    const w = colRef.current;
    if (!el || w <= 0) return;
    goal.current = i;
    const plan = glidePlan(nearestIndex(el.scrollLeft, w), i);
    const quick = calm();
    if (plan.jumpTo != null || quick) {
      el.style.scrollBehavior = "auto";
      el.scrollLeft = offsetOf(plan.jumpTo ?? i, w);
      el.style.scrollBehavior = "";
    }
    if (!quick) el.scrollTo({ left: offsetOf(i, w), behavior: "smooth" });
  }, []);

  /* Sideways a day at a time: a horizontal swipe (or Shift + wheel) steps
     whole days and glides onto the column, instead of panning the strip
     freely. The first event of a gesture steps at once, so one wheel notch is
     one day; the rest of the gesture steps a day per column width travelled.
     A gesture that starts vertical stays vertical (the browser scrolls it). */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const g = { axis: null as "x" | "y" | null, acc: 0, t: 0 };
    const step = (dir: number) =>
      glideTo(jumpGoal(goal.current ?? firstRef.current, dir));
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch zoom
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const dy = e.deltaY * unit;
      let dx = e.deltaX * unit;
      if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) dx = dy;
      const horizontal = Math.abs(dx) > Math.abs(e.shiftKey ? 0 : dy);
      window.clearTimeout(g.t);
      g.t = window.setTimeout(() => {
        g.axis = null;
        g.acc = 0;
      }, WHEEL_IDLE_MS);
      if (g.axis == null) {
        g.axis = horizontal ? "x" : "y";
        if (g.axis === "x") {
          e.preventDefault();
          g.acc = 0;
          if (Math.abs(dx) >= 1) step(Math.sign(dx));
          return;
        }
      }
      if (g.axis !== "x") return;
      e.preventDefault();
      g.acc += dx;
      const per = Math.max(colRef.current, 60);
      while (Math.abs(g.acc) >= per) {
        const dir = Math.sign(g.acc);
        g.acc -= dir * per;
        step(dir);
      }
    };
    /* ←/→ on the focused grid (not in a field, not in a card) move a day. */
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest?.("input, textarea, select, [contenteditable='true']") ||
        t?.isContentEditable
      )
        return;
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(g.t);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
    };
  }, [glideTo]);

  useImperativeHandle(
    handle,
    () => ({
      jump: (days) => glideTo(jumpGoal(goal.current ?? firstRef.current, days)),
      goTo: (date) => glideTo(stripIndex(origin.current, date)),
    }),
    [glideTo]
  );

  const pb = shown && last.current ? findBlock(blocks, last.current.id) : null;
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

  const range = drawnRange(first, n);
  const drawn: number[] = [];
  if (colW > 0) for (let i = range.from; i <= range.to; i++) drawn.push(i);
  const onSlotStable = useCallback(
    (d: string, at: number, end?: number) => cbs.current.onSlot(d, at, end),
    []
  );
  const card = useMemo<DraftCard>(
    () => ({
      kind: createKind,
      onKind: (kind) => cbs.current.onDraft?.({ kind }),
      onRange: (at, end) => cbs.current.onDraft?.({ at, end }),
      onCreate: (spec) => cbs.current.onCreate(spec),
      onCancel: () => cbs.current.onCancel(),
      projects,
      calendars,
    }),
    [createKind, projects, calendars]
  );

  return (
    <div className="c2-week" data-c2-strip="">
      <div
        ref={scroller}
        className="c2-wscroll"
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-label="Week grid. Left and right arrows move a day."
        data-c2-wscroll=""
      >
        <div
          className="c2-wcanvas"
          style={{ width: GUTTER + colW * 2 * STRIP_SPAN }}
        >
          <div className="c2-whead">
            <span className="c2-wcorner" style={{ width: GUTTER }} />
            {drawn.map((i) => {
              const date = stripDate(origin.current, i);
              const d = calDay(date);
              return (
                <div
                  key={date}
                  className={`c2-dayhead c2-wheadcell${date === today ? " is-today" : ""}`}
                  style={{
                    width: colW,
                    transform: `translate3d(${GUTTER + i * colW}px,0,0)`,
                  }}
                >
                  <span className="c2-dayhead-wd">{d.wd}</span>
                  <span className="c2-dayhead-n">{d.n}</span>
                </div>
              );
            })}
          </div>
          <div className="c2-wgrid" style={{ height: GRID_H }}>
            <div className="c2-whours" style={{ width: GUTTER }}>
              {HOURS.map((h) => (
                <span key={h} className="c2-hour" style={{ top: h * C2_H - 7 }}>
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {drawn.map((i) => {
              const date = stripDate(origin.current, i);
              return (
                <DayColumn
                  key={date}
                  date={date}
                  x={GUTTER + i * colW}
                  w={colW}
                  isToday={date === today}
                  mine={blocks.get(date) ?? NONE}
                  draft={draft && draft.date === date ? draft : null}
                  nowHour={date === today ? nowHour : null}
                  work={work}
                  peekId={peekId}
                  hover={hover}
                  dragProps={dragProps}
                  resizeProps={resizeProps}
                  bands={personal?.get(date)}
                  onBand={onPersonal}
                  onSlot={onSlotStable}
                  card={card}
                  onMore={sl.open}
                  moreKey={sl.slot && !sl.leaving ? sl.slot.m.key : null}
                />
              );
            })}
          </div>
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
          onPersonal={onMarkPersonal}
        />
      ) : null}
    </div>
  );
}
