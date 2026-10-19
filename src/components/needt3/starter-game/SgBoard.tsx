"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import type { StarterGroup, StarterSuggestions } from "@/lib/starter-game";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { SgEditor } from "./SgEditor";
import { SgIcon } from "./SgIcon";
import { SgOrb } from "./SgOrb";
import {
  type SgTile,
  countTiles,
  createLabel,
  isGroup,
  tileDetail,
  tileFromItem,
} from "./board";
import { SG_GROUPS } from "./model";

/** A pointer that moves less than this is a tap, not a drag. */
const DRAG_PX = 6;
/** Within this of the scroller's top or bottom edge the board scrolls. */
const EDGE_PX = 70;
const EDGE_SPEED = 12;
/** One tile every this long when the agent sorts the rest. */
const SORT_STEP_MS = 110;

const cx = (...a: Array<string | false | null | undefined>) =>
  a.filter(Boolean).join(" ");

interface Live {
  id: string | null;
  x0: number;
  y0: number;
  on: boolean;
}

/**
 * THE SORT BOARD (sg-game.jsx `SgBoard`). The agent's tiles fly into a grid;
 * the person drags each into Today, This week, Habit or Project. A drag starts
 * after 6 px and the board scrolls near the scroller's edge, so every lane is
 * reachable on a phone. A tap (or Enter) opens the editor. A lane with two or
 * more tiles can be closed with Done into one tinted bar; tapping the bar
 * opens it again. When nothing is left to sort every lane solves, one after
 * another. After four sorted tiles each empty lane offers one suggestion (from
 * the same agent answer), and "Sort the rest for me" puts each remaining tile
 * where the agent suggested.
 */
export function SgBoard({
  initial,
  suggestions,
  phone,
  creating,
  onCreate,
}: {
  initial: readonly SgTile[];
  suggestions: StarterSuggestions;
  phone: boolean;
  creating: boolean;
  onCreate: (all: SgTile[]) => void;
}) {
  const [tiles, setTiles] = useState<SgTile[]>([...initial]);
  const [locked, setLocked] = useState<Partial<Record<StarterGroup, boolean>>>(
    {}
  );
  const [over, setOver] = useState<StarterGroup | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
    null
  );
  const [edit, setEdit] = useState<SgTile | null>(null);
  const live = useRef<Live>({ id: null, x0: 0, y0: 0, on: false });
  const pointer = useRef({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const timers = useRef<number[]>([]);
  const frame = useRef(0);
  const portal = useV3PortalContainer();

  useEffect(
    () => () => {
      cleanup.current?.();
      cancelAnimationFrame(frame.current);
      timers.current.forEach((id) => window.clearTimeout(id));
    },
    []
  );

  const left = tiles.filter((x) => !x.g);
  const sorted = tiles.length - left.length;
  const allDone = left.length === 0 && tiles.length > 0;
  const counts = countTiles(tiles);

  const laneAt = (x: number, y: number): StarterGroup | null => {
    const el = document.elementFromPoint(x, y);
    const lane = el?.closest("[data-sg-lane]")?.getAttribute("data-sg-lane");
    return isGroup(lane ?? null) ? (lane as StarterGroup) : null;
  };
  const scroller = () => root.current?.closest<HTMLElement>(".sg-body") ?? null;

  /** Near the top or bottom edge of the scroller, scroll, frame by frame. */
  const edgeScroll = () => {
    const sc = scroller();
    if (sc && live.current.on) {
      const r = sc.getBoundingClientRect();
      const y = pointer.current.y;
      if (y < r.top + EDGE_PX) sc.scrollTop -= EDGE_SPEED;
      else if (y > r.bottom - EDGE_PX) sc.scrollTop += EDGE_SPEED;
      setOver(laneAt(pointer.current.x, pointer.current.y));
    }
    if (live.current.id) frame.current = requestAnimationFrame(edgeScroll);
  };

  const down = (e: ReactPointerEvent, tile: SgTile) => {
    if (e.button !== undefined && e.button !== 0) return;
    cleanup.current?.();
    live.current = { id: tile.id, x0: e.clientX, y0: e.clientY, on: false };
    pointer.current = { x: e.clientX, y: e.clientY };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(frame.current);
      cleanup.current = null;
    };
    const move = (ev: PointerEvent) => {
      const L = live.current;
      if (!L.id) return;
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!L.on) {
        if (Math.hypot(ev.clientX - L.x0, ev.clientY - L.y0) < DRAG_PX) return;
        L.on = true;
        frame.current = requestAnimationFrame(edgeScroll);
      }
      setDrag({ id: L.id, x: ev.clientX, y: ev.clientY });
      setOver(laneAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      const L = live.current;
      live.current = { id: null, x0: 0, y0: 0, on: false };
      stop();
      if (L.on) {
        const g = laneAt(ev.clientX, ev.clientY);
        if (g) {
          setTiles((ts) => ts.map((x) => (x.id === L.id ? { ...x, g } : x)));
          setLocked((lk) => ({ ...lk, [g]: false }));
        }
      } else {
        setEdit(tile);
      }
      setDrag(null);
      setOver(null);
    };
    const cancel = () => {
      live.current = { id: null, x0: 0, y0: 0, on: false };
      stop();
      setDrag(null);
      setOver(null);
    };
    cleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  /**
   * Enter, Space or a screen reader's activation: the editor, where the Group
   * chips sort it. A pointer tap has `detail` above 0 and is handled on
   * pointer up.
   */
  const activate = (e: ReactMouseEvent, tile: SgTile) => {
    if (e.detail === 0) setEdit(tile);
  };

  const sortRest = () => {
    left.forEach((x, k) => {
      timers.current.push(
        window.setTimeout(
          () =>
            setTiles((ts) =>
              ts.map((y) => (y.id === x.id ? { ...y, g: y.s } : y))
            ),
          k * SORT_STEP_MS
        )
      );
    });
  };

  const addSuggestion = (g: StarterGroup) => {
    const s = suggestions[g];
    if (!s) return;
    setTiles((ts) => [...ts, tileFromItem(s, `s-${g}-${ts.length}`, g)]);
  };

  const dragged = drag ? tiles.find((x) => x.id === drag.id) : undefined;
  const ghostScope = phone ? "sg-phone" : "sg-desk";

  return (
    <div className="sg-board" ref={root} data-sg-board="">
      <div className="sg-board-msg">
        <SgOrb size={22} />
        {allDone ? (
          <span>
            <b>All sorted.</b> Tap a group to open it again.
          </span>
        ) : (
          <span>
            <b>{tiles.length} things from what you said.</b> Drag each into a
            group — tap one to edit.
          </span>
        )}
        {!allDone && left.length ? (
          <button
            type="button"
            className="sg-btn"
            data-sg="sort-rest"
            onClick={sortRest}
          >
            <SgIcon n="spark" s={13} />
            Sort the rest for me
          </button>
        ) : null}
      </div>
      {SG_GROUPS.map((G, gi) => {
        const items = tiles.filter((x) => x.g === G.id);
        const solved = (allDone && items.length > 0) || locked[G.id];
        if (solved) {
          const open = () => setLocked({ ...locked, [G.id]: false });
          return (
            <div
              key={G.id}
              className="sg-lane is-solved"
              data-sg-lane={G.id}
              style={{ "--hue": G.hue, "--k": gi } as CSSProperties}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
              aria-label={`${G.name}: ${items.length}. Open`}
            >
              <span className="sg-lane-name">
                {G.name} · {items.length}
              </span>
              <span className="sg-lane-sum">
                {items.map((x) => x.t).join(" · ")}
              </span>
            </div>
          );
        }
        const hint = !items.length && sorted >= 4 ? suggestions[G.id] : null;
        return (
          <div
            key={G.id}
            className={cx(
              "sg-lane",
              !items.length && "is-empty",
              over === G.id && "is-over"
            )}
            data-sg-lane={G.id}
            style={{ "--hue": G.hue } as CSSProperties}
          >
            <div className="sg-lane-h">
              <span className="sg-lane-name">
                <i />
                {G.name}
              </span>
              <span className="sg-lane-n">{items.length || ""}</span>
              <span className="sg-lane-sub">{G.sub}</span>
              {items.length >= 2 && left.length ? (
                <button
                  type="button"
                  className="sg-btn"
                  data-sg="lane-done"
                  onClick={() => setLocked({ ...locked, [G.id]: true })}
                >
                  <SgIcon n="check" s={12} />
                  Done
                </button>
              ) : null}
            </div>
            {items.length ? (
              <div className="sg-lane-items">
                {items.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="sg-lane-item"
                    onPointerDown={(e) => down(e, x)}
                    onClick={(e) => activate(e, x)}
                  >
                    {x.t}
                    <small>{tileDetail(x)}</small>
                  </button>
                ))}
              </div>
            ) : hint ? (
              <div className="sg-lane-hint" data-sg-hint={G.id}>
                <SgOrb size={16} />
                <span>
                  Maybe{" "}
                  <b style={{ color: "var(--sg-ink)", fontWeight: 500 }}>
                    {hint.title}
                  </b>{" "}
                  · {tileDetail(tileFromItem(hint, "x"))}?
                </span>
                <button
                  type="button"
                  className="sg-btn"
                  data-sg="add-suggestion"
                  onClick={() => addSuggestion(G.id)}
                >
                  + Add
                </button>
              </div>
            ) : (
              <div className="sg-lane-hint">Drop tiles here</div>
            )}
          </div>
        );
      })}
      {left.length ? (
        <div className="sg-grid" role="list" aria-label="Tiles to sort">
          {left.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="listitem"
              data-sg-tile={x.id}
              className={cx("sg-tile", drag?.id === x.id && "is-ghost")}
              style={
                {
                  "--i": i,
                  "--fx": ((i % 4) - 1.5) * -30 + "px",
                  "--fy": "-70px",
                } as CSSProperties
              }
              onPointerDown={(e) => down(e, x)}
              onClick={(e) => activate(e, x)}
              aria-label={`${x.t}, ${tileDetail(x)}. Drag to a group, or tap to edit`}
            >
              <b>{x.t}</b>
              <small>
                {x.k !== "task" ? <span className="k">{x.k}</span> : null}
                {tileDetail(x)}
              </small>
            </button>
          ))}
        </div>
      ) : null}
      <div className="sg-board-foot">
        <span className="sg-hintline">
          {allDone ? "" : `${left.length} left to sort`}
        </span>
        <button
          type="button"
          className="sg-btn is-primary is-lg"
          data-sg="create"
          disabled={!sorted || creating}
          onClick={() => onCreate(tiles)}
        >
          {creating ? "Creating…" : createLabel(counts)}
        </button>
      </div>
      {dragged && drag && portal
        ? createPortal(
            <div className={ghostScope}>
              <div
                className="sg-tile sg-drag"
                style={{ left: drag.x, top: drag.y }}
              >
                <b>{dragged.t}</b>
                <small>{tileDetail(dragged)}</small>
              </div>
            </div>,
            portal
          )
        : null}
      {edit ? (
        <SgEditor
          tile={edit}
          onClose={() => setEdit(null)}
          onDelete={() => {
            setTiles(tiles.filter((x) => x.id !== edit.id));
            setEdit(null);
          }}
          onSave={(next) => {
            setTiles(tiles.map((x) => (x.id === next.id ? next : x)));
            setEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}
