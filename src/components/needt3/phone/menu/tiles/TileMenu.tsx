"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LuLayoutGrid,
  LuMaximize2,
  LuMinimize2,
  LuMinus,
  LuPlus,
  LuSlidersHorizontal,
  LuX,
} from "react-icons/lu";

import { usePhoneMenu, useSavePhoneMenu } from "@/lib/needt3/hooks/phone-menu";
import { useProjects } from "@/lib/needt3/hooks/projects";
import {
  DEFAULT_MENU_TILES,
  DEFAULT_TILE_SIZE,
  MENU_TILE_MAX,
  type MenuTile,
  type MenuTileId,
  addableTiles,
  tileKey,
} from "@/lib/phone-menu/layout";

import { PkScrim } from "../../kit/Scrim";
import { pkTrack } from "../../kit/pointer";
import { pkCx } from "../../kit/util";
import { usePhoneCover } from "../../shell/cover";
import { setInert } from "../a11y";
import { MENU_ORDER, type MenuPlaceId, menuRows, menuWord } from "../places";
import type { MenuCounts } from "../status";
import { TileFace } from "./faces";
import {
  type TileBox,
  dragTo,
  dropIndex,
  reflow,
  removed,
  resized,
  tileView,
} from "./model";
import { useTileFacts } from "./useTileFacts";

/** How long a finger rests on a tile before the menu turns to editing. */
const HOLD_MS = 450;
/** A finger that moves this far is a drag (or a scroll), not a press. */
const SLOP = 8;
/** The layer stays mounted this long after it shuts, for the way out. */
const OUT_MS = 260;
/** The dragged tile's flight to its slot when the finger lets go. */
const SETTLE_MS = 200;
/** The grid's gap (menu-tiles.css), for the step from one cell to the next. */
const GAP = 12;

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

/**
 * The tile menu (owner decisions 2026-11-20, ref 11): the objects the person
 * chose, each one a live miniature of itself (the next tasks, the ring of a
 * focus session, the next event, the latest mail, a project folder with its
 * own papers), glowing in the colour of what it stands for, never the accent.
 * Tiles with several things to show turn through them, Craft-style, on one
 * shared timer. Hold a tile and the menu turns to editing: the tiles jiggle,
 * a drag reorders them while the others make room, − removes, the corner
 * button changes a tile's size and Add opens the catalogue of what can be
 * added. The set is the account's (`/api/phone-menu`). Every place stays one
 * tap away under Places.
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

function tileStyle(hue: string | null | undefined, i: number): CSSProperties {
  return {
    "--ntm-i": i,
    ...(hue ? { "--ntm-hue": hue } : null),
  } as CSSProperties;
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
  const [places, setPlaces] = useState(false);
  const [catalogue, setCatalogue] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const press = useRef<{ off: (() => void) | null; hold: number }>({
    off: null,
    hold: 0,
  });
  const settle = useRef(0);
  const swallow = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  const editRef = useRef(edit);
  editRef.current = edit;
  const catalogueRef = useRef(catalogue);
  catalogueRef.current = catalogue;
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  // In on the frame after it mounts, out as soon as it is told to shut.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      setEdit(false);
      setCatalogue(false);
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
      if (catalogueRef.current) setCatalogue(false);
      else if (editRef.current) setEdit(false);
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
  useEffect(
    () => () => {
      clearPress();
      window.clearTimeout(settle.current);
    },
    [clearPress]
  );

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

  /** Puts every tile's drag offsets back (nothing is left on the DOM). */
  const wipe = () => {
    grid.current
      ?.querySelectorAll<HTMLElement>("[data-ntm-tile]")
      .forEach((n) => {
        n.style.removeProperty("--ntm-dx");
        n.style.removeProperty("--ntm-dy");
        n.style.removeProperty("--ntm-rx");
        n.style.removeProperty("--ntm-ry");
      });
  };

  /* A press on a tile. At rest a hold turns to editing, and the same press goes
     on as a drag if the finger moves; while editing a drag moves the tile and
     the others make room for it at once. The grid is measured once, when the
     drag starts (no observers), and then only transforms move: the order is
     committed after the tile has settled into its slot. */
  const onTilePointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    tile: MenuTile
  ) => {
    if (e.button > 0) return;
    if (settle.current) return;
    clearPress();
    const key = tileKey(tile);
    const el = e.currentTarget.closest<HTMLElement>("[data-ntm-tile]");
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let armed = editRef.current;
    let boxes: TileBox[] = [];
    let els = new Map<string, HTMLElement>();
    let colStep = 0;
    let rowStep = 0;
    let to = -1;
    if (!armed) {
      press.current.hold = window.setTimeout(() => {
        press.current.hold = 0;
        if (!moved) {
          armed = true;
          enterEdit();
        }
      }, HOLD_MS);
    }
    const move = (m: PointerEvent) => {
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < SLOP) return;
      if (!moved) {
        window.clearTimeout(press.current.hold);
        press.current.hold = 0;
        if (!armed) {
          moved = true; // a scroll, not a drag
          return;
        }
        moved = true;
        const list = Array.from(
          grid.current?.querySelectorAll<HTMLElement>("[data-ntm-tile]") ?? []
        );
        els = new Map(list.map((n) => [n.dataset.ntmTile ?? "", n]));
        boxes = list.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            key: n.dataset.ntmTile ?? "",
            x: r.left,
            y: r.top,
            w: r.width,
            h: r.height,
          };
        });
        const g = grid.current?.getBoundingClientRect();
        colStep = ((g?.width ?? 0) + GAP) / 2;
        rowStep = (boxes[0]?.h ?? 164) + GAP;
        to = tilesRef.current.findIndex((t) => tileKey(t) === key);
        setDragging(key);
      }
      if (!armed || !el) return;
      el.style.setProperty("--ntm-dx", `${dx}px`);
      el.style.setProperty("--ntm-dy", `${dy}px`);
      const at = dropIndex(boxes, m.clientX, m.clientY);
      if (at !== to && at >= 0) {
        to = at;
        // the others take their new places, by translation only
        for (const [k, s] of reflow(tilesRef.current, key, at)) {
          if (k === key) continue;
          const n = els.get(k);
          if (!n) continue;
          n.style.setProperty("--ntm-rx", `${s.dc * colStep}px`);
          n.style.setProperty("--ntm-ry", `${s.dr * rowStep}px`);
        }
      }
    };
    const end = (_: PointerEvent | null, reason: "up" | "cancel") => {
      window.clearTimeout(press.current.hold);
      press.current.hold = 0;
      press.current.off = null;
      if (moved) swallow.current = performance.now();
      if (!armed || !moved) return;
      if (reason !== "up" || to < 0) {
        wipe();
        setDragging(null);
        return;
      }
      // fly to the slot, then commit the order with nothing animating
      const mine = reflow(tilesRef.current, key, to).get(key);
      el?.style.setProperty("--ntm-dx", `${(mine?.dc ?? 0) * colStep}px`);
      el?.style.setProperty("--ntm-dy", `${(mine?.dr ?? 0) * rowStep}px`);
      grid.current?.setAttribute("data-ntm-settle", "");
      const next = dragTo(tilesRef.current, key, to);
      settle.current = window.setTimeout(() => {
        grid.current?.setAttribute("data-ntm-flush", "");
        grid.current?.removeAttribute("data-ntm-settle");
        wipe();
        commit(next);
        setDragging(null);
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => {
            grid.current?.removeAttribute("data-ntm-flush");
            settle.current = 0;
          })
        );
      }, SETTLE_MS);
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

  const rows = menuRows([], {
    agents: counts.agents !== undefined,
    budget: counts.budget !== undefined,
    learn: counts.learn !== undefined,
  });
  const allPlaces = MENU_ORDER.filter((id) => rows.includes(id));
  const onProjects = new Set(
    tiles.filter((t) => t.id === "project").map((t) => t.projectId)
  );
  const freeProjects = (projects ?? []).filter(
    (p) => !p.archived && !p.trashedAt && !onProjects.has(p.id)
  );
  const full = tiles.length >= MENU_TILE_MAX;
  const free = addableTiles(tiles).filter((id) => id !== "project");
  // Nothing turns while the menu is shut, being edited, dragged or covered.
  const live = open && !edit && !dragging && !places && !catalogue;

  const preview = (tile: MenuTile, i: number) => {
    const v = tileView(tile, facts);
    return (
      <li
        key={tileKey(tile)}
        className={pkCx(
          "ntm-tile",
          "ntm-cat-tile",
          tile.size === "2x1" && "is-wide"
        )}
        data-tile={tile.id}
        style={tileStyle(v.hue, i)}
      >
        <button
          type="button"
          className="ntm-hit"
          data-ntm-add={tile.id}
          aria-label={`Add ${v.name}`}
          disabled={full}
          onClick={() => add(tile.id, tile.projectId)}
        >
          <TileFace
            tile={tile}
            view={v}
            facts={facts}
            offset={i}
            active={false}
          />
        </button>
        <span className="ntm-plus" aria-hidden="true">
          <LuPlus size={16} strokeWidth={2.4} />
        </span>
      </li>
    );
  };

  const catalogueTiles: MenuTile[] = [
    ...free.map((id): MenuTile => ({ id, size: DEFAULT_TILE_SIZE[id] })),
    ...freeProjects.map(
      (p): MenuTile => ({
        id: "project",
        size: DEFAULT_TILE_SIZE.project,
        projectId: p.id,
      })
    ),
  ];

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
      <PkScrim
        scrimRef={scrim}
        open={open}
        onClick={() => !edit && onClose()}
      />
      <header className="ntm-head">
        <h2 className="ntm-title">
          {catalogue ? "Add" : places ? "Places" : edit ? "Edit tiles" : "Menu"}
        </h2>
        {edit && !catalogue ? (
          <p className="ntm-hint">Hold and drag to reorder.</p>
        ) : null}
      </header>
      <div
        className="ntm-body"
        onClick={(e) => e.currentTarget === e.target && !edit && onClose()}
      >
        {places ? (
          <section className="ntm-more" aria-label="Every place">
            <div className="ntm-chips">
              {allPlaces.map((id) => (
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
        ) : (
          <>
            <ul ref={grid} className="ntm-grid" data-ntm-grid="">
              {tiles.map((tile, i) => {
                const key = tileKey(tile);
                const v = tileView(tile, facts);
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
                    style={tileStyle(v.hue, i)}
                  >
                    <button
                      type="button"
                      className="ntm-hit"
                      data-ntm-hit=""
                      aria-label={
                        edit
                          ? `${v.name}. Arrow keys move it, Delete removes it.`
                          : `${v.label}, ${v.word}, ${v.sub}`
                      }
                      onPointerDown={(e) => onTilePointerDown(e, tile)}
                      onClick={() => onTileClick(tile)}
                      onKeyDown={(e) => onTileKey(e, tile, i)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <TileFace
                        tile={tile}
                        view={v}
                        facts={facts}
                        offset={i}
                        active={live}
                      />
                    </button>
                    {edit ? (
                      <>
                        <button
                          type="button"
                          className="ntm-minus"
                          aria-label={`Remove ${v.name}`}
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
                              ? `Make ${v.name} wide`
                              : `Make ${v.name} square`
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
                {edit ? "No tiles. Add one." : "No tiles yet."}
              </p>
            ) : null}
            {edit ? (
              <div className="ntm-editbar">
                <button
                  type="button"
                  className="ntm-pill"
                  data-ntm-open-add=""
                  disabled={full || !catalogueTiles.length}
                  onClick={() => setCatalogue(true)}
                >
                  <LuPlus size={15} aria-hidden />
                  {full ? `${MENU_TILE_MAX} tiles is the most` : "Add"}
                </button>
                <button
                  type="button"
                  className="ntm-link"
                  onClick={() => commit([...DEFAULT_MENU_TILES])}
                >
                  Reset
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {catalogue ? (
        <section className="ntm-cat" aria-label="Add a tile">
          <div className="ntm-cat-body">
            {catalogueTiles.length ? (
              <ul className="ntm-grid ntm-cat-grid">
                {catalogueTiles.map((t, i) => preview(t, i))}
              </ul>
            ) : (
              <p className="ntm-empty">Everything is already on the menu.</p>
            )}
          </div>
          <button
            type="button"
            className="ntm-pill ntm-cat-done"
            data-ntm-cat-done=""
            onClick={() => setCatalogue(false)}
          >
            Done
          </button>
        </section>
      ) : null}
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
            <div className="ntm-foot-row">
              <button
                type="button"
                className="ntm-link"
                data-ntm-customize=""
                onClick={() => {
                  setPlaces(false);
                  setEdit(true);
                }}
              >
                <LuSlidersHorizontal size={16} aria-hidden />
                Edit tiles
              </button>
              <button
                type="button"
                className="ntm-link"
                data-ntm-places=""
                onClick={() => setPlaces((p) => !p)}
              >
                <LuLayoutGrid size={16} aria-hidden />
                {places ? "Tiles" : "Places"}
              </button>
            </div>
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
