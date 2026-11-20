"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LuFlame,
  LuFolder,
  LuInbox,
  LuMaximize2,
  LuMinimize2,
  LuMinus,
  LuPlus,
  LuSlidersHorizontal,
  LuX,
} from "react-icons/lu";

import {
  DEFAULT_MENU_TILES,
  DEFAULT_TILE_SIZE,
  MENU_TILE_MAX,
  type MenuTile,
  type MenuTileId,
  addableTiles,
  tileKey,
} from "@/lib/phone-menu/layout";
import { usePhoneMenu, useSavePhoneMenu } from "@/lib/needt3/hooks/phone-menu";
import { useProjects } from "@/lib/needt3/hooks/projects";

import { Glyph, type GlyphName } from "../../../glyphs/Glyph";
import { PkScrim } from "../../kit/Scrim";
import { pkTrack } from "../../kit/pointer";
import { pkCx } from "../../kit/util";
import { usePhoneCover } from "../../shell/cover";
import { setInert } from "../a11y";
import { MENU_ORDER, type MenuPlaceId, menuRows, menuWord } from "../places";
import type { MenuCounts } from "../status";
import {
  type TileBox,
  type TileFacts,
  type TileView,
  dragTo,
  dropIndex,
  placesOnGrid,
  removed,
  resized,
  tileName,
  tileView,
} from "./model";
import { useTileFacts } from "./useTileFacts";

/** How long a finger rests on a tile before the menu turns to editing. */
const HOLD_MS = 450;
/** A finger that moves this far is a drag (or a scroll), not a press. */
const SLOP = 8;
/** The layer stays mounted this long after it shuts, for the way out. */
const OUT_MS = 260;

export interface TileMenuProps {
  open: boolean;
  onClose: () => void;
  counts: MenuCounts;
  /** A place was chosen (a route, Ask Needt, Settings). */
  onPick: (id: MenuPlaceId) => void;
  /** A project folder was chosen. */
  onProject: (id: string) => void;
  /** The Focus tile was chosen: the Focus sheet opens. */
  onFocus: () => void;
}

/** True while `open`, and for `ms` after it turns false. */
function useLinger(open: boolean, ms: number) {
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return undefined;
    }
    const id = window.setTimeout(() => setLingering(false), ms);
    return () => window.clearTimeout(id);
  }, [open, ms]);
  return open || lingering;
}

const GLYPH: Partial<Record<MenuTileId, GlyphName>> = {
  today: "home",
  calendar: "calendar",
  habits: "habits",
  mail: "mail",
  docs: "docs",
  ask: "ai",
};

/** The mark on a tile's plate. */
function TileMark({ id }: { id: MenuTileId }) {
  const g = GLYPH[id];
  if (g) return <Glyph name={g} size={24} />;
  if (id === "streak") return <LuFlame size={20} aria-hidden />;
  if (id === "inbox") return <LuInbox size={20} aria-hidden />;
  return <LuFolder size={20} aria-hidden />;
}

/** The focus tile's ring: the accent is the ring's mark, never a fill. */
function FocusRing({ pct, paused }: { pct: number; paused: boolean }) {
  const R = 17;
  const C = 2 * Math.PI * R;
  return (
    <svg
      className={pkCx("ntm-ring", paused && "is-paused")}
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <circle
        cx="22"
        cy="22"
        r={R}
        fill="none"
        stroke="var(--v2p-line)"
        strokeWidth="3"
      />
      <circle
        className="ntm-ring-arc"
        cx="22"
        cy="22"
        r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.max(pct, 0.001))}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

function TileBody({
  tile,
  view,
  facts,
}: {
  tile: MenuTile;
  view: TileView;
  facts: TileFacts;
}) {
  return (
    <>
      <span className="ntm-label">{view.label}</span>
      <span className="ntm-word">{view.word}</span>
      <span className={pkCx("ntm-sub", view.alert && "is-alert")}>
        {view.sub}
      </span>
      <span className="ntm-plate" aria-hidden="true">
        {tile.id === "focus" ? (
          <FocusRing pct={facts.focus?.pct ?? 0} paused={!!facts.focus?.paused} />
        ) : (
          <TileMark id={tile.id} />
        )}
      </span>
    </>
  );
}

/**
 * The tile menu (owner decisions 2026-11-20, ref 11): the app menu as a grid
 * of tiles over a blurred screen. Each tile is a live card (Today, Focus's
 * ring, the next event, mail, a project folder) glowing in the colour of the
 * object it stands for, never the accent. Hold a tile and the menu turns to
 * editing: the tiles jiggle, − removes, the corner button changes a tile's
 * size, a drag reorders, Add brings one back, and ✕ ends it. The set is the
 * account's (`/api/phone-menu`). Every place that has no tile stays one tap
 * away under the grid.
 */
export function TileMenu({
  open,
  onClose,
  counts,
  onPick,
  onProject,
  onFocus,
}: TileMenuProps) {
  const mounted = useLinger(open, OUT_MS);
  // The dock steps down and away under the menu: it draws its own way out.
  usePhoneCover(open);
  if (!mounted) return null;
  return (
    <TileMenuLayer
      open={open}
      onClose={onClose}
      counts={counts}
      onPick={onPick}
      onProject={onProject}
      onFocus={onFocus}
    />
  );
}

function TileMenuLayer({
  open,
  onClose,
  counts,
  onPick,
  onProject,
  onFocus,
}: TileMenuProps) {
  const layout = usePhoneMenu();
  const save = useSavePhoneMenu();
  const projects = useProjects().data;
  const facts = useTileFacts(counts);
  const tiles = useMemo<readonly MenuTile[]>(
    () => layout.data?.tiles ?? DEFAULT_MENU_TILES,
    [layout.data]
  );
  const [edit, setEdit] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const press = useRef<{ off: (() => void) | null; hold: number }>({
    off: null,
    hold: 0,
  });
  const swallow = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  const editRef = useRef(edit);
  editRef.current = edit;

  // In on the frame after it mounts, out as soon as it is told to shut.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      setEdit(false);
      return undefined;
    }
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, [open]);
  useLayoutEffect(() => {
    scrim.current?.style.setProperty("--pk-scrim-k", entered ? "1" : "0");
  }, [entered]);

  // Behind the menu nothing takes a tap or the keyboard; focus goes in, and
  // back to what had it when the menu shuts.
  useEffect(() => {
    if (!open) return undefined;
    const el = root.current;
    const host =
      el?.closest("[data-v2p-frame]")?.querySelector("[data-v2p-host]") ?? null;
    setInert(host, true);
    const before = document.activeElement as HTMLElement | null;
    el?.querySelector<HTMLElement>("[data-ntm-hit]")?.focus({
      preventScroll: true,
    });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (editRef.current) setEdit(false);
      else close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      setInert(host, false);
      if (before && document.contains(before))
        before.focus({ preventScroll: true });
    };
  }, [open]);

  const clearPress = useCallback(() => {
    window.clearTimeout(press.current.hold);
    press.current.hold = 0;
    press.current.off?.();
    press.current.off = null;
  }, []);
  useEffect(() => clearPress, [clearPress]);

  const commit = useCallback(
    (next: MenuTile[]) => {
      void save({ tiles: next });
    },
    [save]
  );

  const enterEdit = useCallback(() => {
    setEdit(true);
    swallow.current = performance.now();
    try {
      navigator.vibrate?.(8);
    } catch {
      /* no haptics here */
    }
  }, []);

  const go = (tile: MenuTile) => {
    const v = tileView(tile, facts);
    close.current();
    if (v.go.kind === "focus") onFocus();
    else if (v.go.kind === "project") onProject(v.go.id);
    else onPick(v.go.id);
  };

  /* A press on a tile. At rest a hold turns to editing; while editing a
     drag moves the tile (measured once, when it starts: no observers, and
     nothing reflows under the finger). */
  const onTilePointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    tile: MenuTile
  ) => {
    if (e.button > 0) return;
    clearPress();
    const key = tileKey(tile);
    const el = e.currentTarget.closest<HTMLElement>("[data-ntm-tile]");
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let boxes: TileBox[] = [];
    let to = -1;
    const wasEditing = editRef.current;
    if (!wasEditing) {
      press.current.hold = window.setTimeout(() => {
        press.current.hold = 0;
        if (!moved) enterEdit();
      }, HOLD_MS);
    }
    const move = (m: PointerEvent) => {
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < SLOP) return;
      if (!moved) {
        moved = true;
        window.clearTimeout(press.current.hold);
        press.current.hold = 0;
        if (!wasEditing) return; // a scroll, not a drag
        boxes = Array.from(
          grid.current?.querySelectorAll<HTMLElement>("[data-ntm-tile]") ?? []
        ).map((n) => {
          const r = n.getBoundingClientRect();
          return {
            key: n.dataset.ntmTile ?? "",
            x: r.left,
            y: r.top,
            w: r.width,
            h: r.height,
          };
        });
        setDragging(key);
      }
      if (!wasEditing || !el) return;
      el.style.setProperty("--ntm-dx", `${dx}px`);
      el.style.setProperty("--ntm-dy", `${dy}px`);
      const at = dropIndex(boxes, m.clientX, m.clientY);
      if (at !== to) {
        to = at;
        grid.current
          ?.querySelectorAll("[data-ntm-drop]")
          .forEach((n) => n.removeAttribute("data-ntm-drop"));
        if (boxes[at] && boxes[at].key !== key)
          grid.current
            ?.querySelector(`[data-ntm-tile="${CSS.escape(boxes[at].key)}"]`)
            ?.setAttribute("data-ntm-drop", "");
      }
    };
    const end = (_: PointerEvent | null, reason: "up" | "cancel") => {
      window.clearTimeout(press.current.hold);
      press.current.hold = 0;
      press.current.off = null;
      grid.current
        ?.querySelectorAll("[data-ntm-drop]")
        .forEach((n) => n.removeAttribute("data-ntm-drop"));
      el?.style.removeProperty("--ntm-dx");
      el?.style.removeProperty("--ntm-dy");
      if (moved) swallow.current = performance.now();
      if (wasEditing && moved) {
        setDragging(null);
        if (reason === "up" && to >= 0) commit(dragTo(tiles, key, to));
      }
    };
    press.current.off = pkTrack(move, end, e.pointerId);
  };

  const onTileClick = (tile: MenuTile) => {
    // a hold or a drag is not a tap
    if (performance.now() - swallow.current < 400) return;
    if (edit) return;
    go(tile);
  };

  const onTileKey = (e: ReactKeyboardEvent, tile: MenuTile, i: number) => {
    if (!edit) return;
    const key = tileKey(tile);
    const step =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : 0;
    if (step) {
      e.preventDefault();
      const to = i + step;
      if (to >= 0 && to < tiles.length) commit(dragTo(tiles, key, to));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      commit(removed(tiles, key));
    }
  };

  const add = (id: MenuTileId, projectId?: string) => {
    if (tiles.length >= MENU_TILE_MAX) return;
    const tile: MenuTile =
      id === "project"
        ? { id, size: DEFAULT_TILE_SIZE[id], projectId }
        : { id, size: DEFAULT_TILE_SIZE[id] };
    commit([...tiles, tile]);
  };

  const onGrid = placesOnGrid(tiles);
  const places = menuRows([], {
    agents: counts.agents !== undefined,
    budget: counts.budget !== undefined,
    learn: counts.learn !== undefined,
  }).filter((id) => !onGrid.has(id));
  const more = MENU_ORDER.filter((id) => places.includes(id));
  const onProjects = new Set(
    tiles.filter((t) => t.id === "project").map((t) => t.projectId)
  );
  const freeProjects = (projects ?? []).filter(
    (p) => !p.archived && !p.trashedAt && !onProjects.has(p.id)
  );
  const full = tiles.length >= MENU_TILE_MAX;
  const free = addableTiles(tiles).filter((id) => id !== "project");

  let scrap: ReactNode = null;
  if (edit) {
    scrap = (
      <section className="ntm-add" aria-label="Add a tile">
        <span className="ntm-cap">
          {full ? `${MENU_TILE_MAX} tiles is the most` : "Add"}
        </span>
        <div className="ntm-chips">
          {free.map((id) => (
            <button
              key={id}
              type="button"
              className="ntm-chip"
              data-ntm-add={id}
              disabled={full}
              onClick={() => add(id)}
            >
              <LuPlus size={14} aria-hidden />
              {tileName(id)}
            </button>
          ))}
          {freeProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ntm-chip"
              data-ntm-add="project"
              disabled={full}
              onClick={() => add("project", p.id)}
            >
              <LuFolder size={14} aria-hidden />
              {p.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ntm-link"
          onClick={() => commit([...DEFAULT_MENU_TILES])}
        >
          Reset to the default tiles
        </button>
      </section>
    );
  } else {
    scrap = (
      <section className="ntm-more" aria-label="Every place">
        <span className="ntm-cap">All places</span>
        <div className="ntm-chips">
          {more.map((id) => (
            <button
              key={id}
              type="button"
              className="ntm-chip"
              data-ntm-place={id}
              onClick={() => {
                close.current();
                onPick(id);
              }}
            >
              {menuWord(id)}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div
      ref={root}
      className={pkCx(
        "ntm",
        entered && "is-in",
        edit && "is-edit",
        dragging && "is-dragging"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-ntm={open ? "open" : "shut"}
      data-assistant-avoid=""
    >
      <PkScrim scrimRef={scrim} open={open} onClick={() => !edit && onClose()} />
      <header className="ntm-head">
        <h2 className="ntm-title">{edit ? "Edit tiles" : "Menu"}</h2>
        {edit ? (
          <p className="ntm-hint">Hold and drag to reorder.</p>
        ) : null}
      </header>
      <div className="ntm-body" onClick={(e) => e.currentTarget === e.target && !edit && onClose()}>
        <ul ref={grid} className="ntm-grid" data-ntm-grid="">
          {tiles.map((tile, i) => {
            const key = tileKey(tile);
            const v = tileView(tile, facts);
            const style = {
              "--ntm-i": i,
              ...(v.hue ? { "--ntm-hue": v.hue } : null),
            } as CSSProperties;
            return (
              <li
                key={key}
                className={pkCx(
                  "ntm-tile",
                  tile.size === "2x1" && "is-wide",
                  v.quiet && "is-quiet",
                  dragging === key && "is-lifted"
                )}
                data-ntm-tile={key}
                data-tile={tile.id}
                style={style}
              >
                <button
                  type="button"
                  className="ntm-hit"
                  data-ntm-hit=""
                  aria-label={
                    edit
                      ? `${tileName(tile.id)}${tile.id === "project" ? ` ${v.word}` : ""}. Arrow keys move it, Delete removes it.`
                      : `${v.label}, ${v.word}, ${v.sub}`
                  }
                  onPointerDown={(e) => onTilePointerDown(e, tile)}
                  onClick={() => onTileClick(tile)}
                  onKeyDown={(e) => onTileKey(e, tile, i)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <TileBody tile={tile} view={v} facts={facts} />
                </button>
                {edit ? (
                  <>
                    <button
                      type="button"
                      className="ntm-minus"
                      aria-label={`Remove ${tileName(tile.id)}`}
                      data-ntm-remove={key}
                      onClick={() => commit(removed(tiles, key))}
                    >
                      <LuMinus size={16} strokeWidth={2.4} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ntm-size"
                      aria-label={
                        tile.size === "1x1"
                          ? `Make ${tileName(tile.id)} wide`
                          : `Make ${tileName(tile.id)} square`
                      }
                      data-ntm-size={key}
                      onClick={() => commit(resized(tiles, key))}
                    >
                      {tile.size === "1x1" ? (
                        <LuMaximize2 size={13} aria-hidden />
                      ) : (
                        <LuMinimize2 size={13} aria-hidden />
                      )}
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!tiles.length ? (
          <p className="ntm-empty">
            {edit ? "No tiles. Add one below." : "No tiles yet."}
          </p>
        ) : null}
        {scrap}
      </div>
      <footer className="ntm-foot">
        {edit ? (
          <button
            type="button"
            className="ntm-round"
            aria-label="Done editing"
            data-ntm-done=""
            onClick={() => setEdit(false)}
          >
            <LuX size={22} aria-hidden />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ntm-link"
              data-ntm-customize=""
              onClick={() => setEdit(true)}
            >
              <LuSlidersHorizontal size={16} aria-hidden />
              Edit tiles
            </button>
            <button
              type="button"
              className="ntm-round"
              aria-label="Close menu"
              data-ntm-close=""
              onClick={onClose}
            >
              <LuX size={22} aria-hidden />
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
