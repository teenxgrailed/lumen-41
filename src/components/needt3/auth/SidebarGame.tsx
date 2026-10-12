"use client";

/* "Make your sidebar" (prototype ObSidebarGame, 08.10.26). The order is every
   place id; the first five are the tiles and More is always the sixth, holding
   the rest in order. Interactions:
     - drag a place from the sea onto a tile: they swap (the replaced tile
       springs back into the sea where the new one was);
     - drag a tile onto another: they swap;
     - click / Enter a place, then a tile (or the other way round): same swap;
     - Esc drops the pick. More cannot move.
   The sea tiles settle once when the step mounts, then hold still. The drag
   ghost lives in a portal inside the `.needt-v3` scope (a fixed child of the
   glass card would be trapped by its backdrop-filter). */
import * as React from "react";

import { createPortal } from "react-dom";

import { PxSky } from "../scenes";
import { PlaceGlyph } from "../shell/PlaceGlyph";
import { PLACES, type PlaceId, TILE_SHORT } from "../shell/places";
import {
  SB_TILES,
  canDrop,
  swapEffect,
  swapSay,
  swapTiles,
} from "./onboarding-steps";

const label = (id: string) => PLACES.find((p) => p.id === id)?.label ?? id;

function MoreMark() {
  return (
    <span className="ob-sb-more" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <i key={n} />
      ))}
    </span>
  );
}

function Tile({
  id,
  picked,
  over,
  back,
  land,
  drag,
  onDown,
  onPick,
  slot,
  name,
}: {
  id: string;
  picked?: boolean;
  over?: boolean;
  back?: boolean;
  land?: boolean;
  drag?: boolean;
  onDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPick?: () => void;
  slot?: number;
  name?: string;
}) {
  const cls =
    "sb-place ob-sb-tile sb-place-box" +
    (picked ? " is-picked" : "") +
    (over ? " is-over" : "") +
    (back ? " is-back" : "") +
    (land ? " is-land" : "") +
    (drag ? " is-lifted" : "");
  if (id === "more") {
    return (
      <span
        className={cls + " is-fixed"}
        data-ob-slot={slot}
        data-ob-more=""
        title="More always stays last — it holds every other place"
      >
        <MoreMark />
        <span className="sb-place-label">More</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      data-ob-tile={id}
      data-ob-slot={slot}
      aria-pressed={picked || undefined}
      aria-label={name || label(id)}
      onPointerDown={onDown}
      onClick={onPick}
    >
      <PlaceGlyph id={id} />
      <span className="sb-place-label">
        {TILE_SHORT[id as PlaceId] || label(id)}
      </span>
    </button>
  );
}

interface Ghost {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  over: string | null;
  returning?: boolean;
}

export function SidebarGame({
  order,
  onOrder,
}: {
  order: string[];
  onOrder: (next: string[]) => void;
}) {
  const [pick, setPick] = React.useState<string | null>(null);
  const [ghost, setGhost] = React.useState<Ghost | null>(null);
  const [fx, setFx] = React.useState<Record<string, "land" | "back">>({});
  const [say, setSay] = React.useState("");
  const root = React.useRef<HTMLDivElement>(null);
  const justDragged = React.useRef(false);
  const orderRef = React.useRef(order);
  orderRef.current = order;
  const grid = order.slice(0, SB_TILES);
  const sea = order.slice(SB_TILES);

  React.useEffect(() => {
    if (!pick) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPick(null);
        setSay("Pick dropped.");
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pick]);

  function swap(a: string, b: string) {
    const cur = orderRef.current;
    const e = swapEffect(cur, a, b);
    onOrder(swapTiles(cur, a, b));
    const f: Record<string, "land" | "back"> = { [a]: "land", [b]: "land" };
    if (e.back) f[e.back] = "back";
    setFx(f);
    window.setTimeout(() => setFx({}), 700);
    setSay(swapSay(label, cur, a, b));
  }

  function onPick(id: string) {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (!pick) {
      setPick(id);
      setSay(
        `${label(id)} picked — now choose ${
          order.indexOf(id) < SB_TILES
            ? "another tile or a place below"
            : "a tile to put it on"
        }. Esc cancels.`
      );
      return;
    }
    if (pick === id) {
      setPick(null);
      setSay("Pick dropped.");
      return;
    }
    const pg = order.indexOf(pick) < SB_TILES;
    const ig = order.indexOf(id) < SB_TILES;
    if (!pg && !ig) {
      setPick(id);
      setSay(`${label(id)} picked — now choose a tile to put it on.`);
      return;
    }
    setPick(null);
    swap(pick, id);
  }

  /* Pointer drag: lifts after 5 px. */
  function onDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const d = {
      id,
      sx: e.clientX,
      sy: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      h: r.height,
      home: { x: r.left, y: r.top },
      on: false,
      over: null as string | null,
    };
    const overOf = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      const t = el?.closest?.("[data-ob-slot]");
      if (!t || !root.current?.contains(t) || t.hasAttribute("data-ob-more"))
        return null;
      const target = t.getAttribute("data-ob-tile");
      return target && canDrop(orderRef.current, id, target) ? target : null;
    };
    const move = (ev: PointerEvent) => {
      if (!d.on && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.on = true;
      d.over = overOf(ev.clientX, ev.clientY);
      setPick(null);
      setGhost({
        id,
        x: ev.clientX - d.dx,
        y: ev.clientY - d.dy,
        w: d.w,
        h: d.h,
        over: d.over,
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!d.on) return;
      justDragged.current = true;
      window.setTimeout(() => {
        justDragged.current = false;
      }, 0);
      const cur = orderRef.current;
      const fromGrid = cur.indexOf(id) < SB_TILES;
      const toGrid = d.over ? cur.indexOf(d.over) < SB_TILES : false;
      if (d.over && (fromGrid || toGrid)) {
        setGhost(null);
        swap(id, d.over);
        return;
      }
      /* Nowhere useful: spring back home. */
      setGhost((g) =>
        g ? { ...g, x: d.home.x, y: d.home.y, over: null, returning: true } : g
      );
      window.setTimeout(() => setGhost(null), 260);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const lifted = ghost?.id;
  const scope = root.current?.closest(".needt-v3") ?? null;
  const ghostEl =
    ghost && scope
      ? createPortal(
          <div
            className={"ob-sb-ghost" + (ghost.returning ? " is-returning" : "")}
            aria-hidden="true"
            style={
              {
                "--ob-x": ghost.x + "px",
                "--ob-y": ghost.y + "px",
                "--ob-w": ghost.w + "px",
                "--ob-h": ghost.h + "px",
              } as React.CSSProperties
            }
          >
            <Tile id={ghost.id} />
          </div>,
          scope
        )
      : null;

  return (
    <div
      ref={root}
      className={
        "ob-sb" + (ghost ? " is-dragging" : "") + (pick ? " is-picking" : "")
      }
      data-ob-sidebar=""
    >
      <span className="px-kicker auth-onboarding-el-2">
        Your sidebar · 5 tiles and More
      </span>
      <div className="ob-sb-panel">
        <div className="ob-sb-grid" role="group" aria-label="Sidebar tiles">
          {grid.map((id, n) => (
            <div key={id} className="ob-sb-cell">
              <Tile
                id={id}
                slot={n}
                picked={pick === id}
                over={ghost?.over === id}
                land={fx[id] === "land"}
                drag={lifted === id}
                name={`Tile ${n + 1}: ${label(id)}`}
                onDown={(e) => onDown(e, id)}
                onPick={() => onPick(id)}
              />
            </div>
          ))}
          <div className="ob-sb-cell">
            <Tile id="more" slot={SB_TILES} />
          </div>
        </div>
      </div>
      <span className="px-kicker auth-onboarding-el-2 auth-ob-gap">
        Everything else · drag one up
      </span>
      <div className="ob-sb-sea">
        <PxSky
          variant="b"
          horizon="cloudsea"
          radius={16}
          className="ob-sb-sky"
        />
        <div
          className="ob-sb-float"
          role="group"
          aria-label="Places under More"
        >
          {sea.map((id, n) => (
            <span key={id} className={"ob-sb-bob is-b" + (n % 4)}>
              <Tile
                id={id}
                slot={SB_TILES + 1 + n}
                picked={pick === id}
                over={ghost?.over === id}
                back={fx[id] === "back"}
                drag={lifted === id}
                name={`${label(id)} (under More)`}
                onDown={(e) => onDown(e, id)}
                onPick={() => onPick(id)}
              />
            </span>
          ))}
        </div>
      </div>
      <span
        className="auth-ob-hint"
        role="status"
        aria-live="polite"
        data-ob-say
      >
        {say ||
          "Drag a place onto a tile to swap it in, or drag tiles to reorder. Or click one, then a tile."}
      </span>
      {ghostEl}
    </div>
  );
}
