"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

import { type CityPlace, cityLabel, citySubline } from "@/lib/needt3/city";
import { CITY_SEARCH_MIN, useCitySearch } from "@/lib/needt3/hooks/weather";

import { useV3PortalContainer } from "../ctx/PortalScope";

const POP_MAX_W = 300;
const POP_GAP = 6;
const EDGE = 8;

/**
 * The "City" picker (Settings, General; phone Settings, General): type a few
 * letters, pick a place from the list. What is saved is the place itself,
 * name, country and coordinates, so the weather never has to guess which
 * "Springfield" was meant. Nothing is saved while typing; leaving the field
 * without picking puts back what was there. The cross clears the city, and
 * Home shows no weather line.
 *
 * An older city that was typed as plain text (`city`, no `place`) still shows
 * and still works until it is replaced.
 */
export function CityField({
  city,
  place,
  disabled,
  onPick,
  width = 200,
}: {
  /** The readable name that is saved (`prefs.city`). */
  city: string;
  /** The picked place, when there is one (`prefs.cityPlace`). */
  place: CityPlace | null;
  disabled?: boolean;
  /** A chosen place, or null when the city is cleared. */
  onPick: (place: CityPlace | null) => void;
  width?: number;
}) {
  const shown = place ? cityLabel(place) : city;
  const [draft, setDraft] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const container = useV3PortalContainer();
  const listId = useId();
  const optId = (i: number) => `${listId}-o${i}`;

  // The list is open exactly while something is being typed.
  const open = draft !== null;
  const typed = draft ?? "";
  const search = useCitySearch(typed);
  const { cities } = search;
  useEffect(() => setActive(0), [cities]);

  // The list is a fixed layer beside the field, so no scrolling parent clips it.
  const [box, setBox] = useState<CSSProperties | null>(null);
  const place_ = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(POP_MAX_W, window.innerWidth - EDGE * 2);
    const left = Math.max(
      EDGE,
      Math.min(r.right - w, window.innerWidth - w - EDGE)
    );
    setBox({ position: "fixed", top: r.bottom + POP_GAP, left, width: w });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place_();
    window.addEventListener("resize", place_);
    window.addEventListener("scroll", place_, true);
    return () => {
      window.removeEventListener("resize", place_);
      window.removeEventListener("scroll", place_, true);
    };
  }, [open, place_]);

  const close = () => setDraft(null);
  // Escape closes the list first. The sheet around the field also listens for
  // it, so this runs before the page does (capture) and keeps the sheet open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setDraft(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const choose = (p: CityPlace) => {
    close();
    if (
      !place ||
      p.latitude !== place.latitude ||
      p.longitude !== place.longitude
    )
      onPick(p);
    input.current?.blur();
  };

  const long = typed.trim().length >= CITY_SEARCH_MIN;
  const note = !long
    ? "Type at least two letters."
    : search.failed
      ? "Suggestions are unavailable. Try again in a moment."
      : search.searching && cities.length === 0
        ? "Searching…"
        : search.asked && cities.length === 0
          ? "No city found. Check the spelling."
          : null;

  return (
    <span
      ref={wrap}
      className="city-pick"
      style={{ width }}
      data-open={open && !disabled ? "" : undefined}
    >
      <input
        ref={input}
        type="text"
        role="combobox"
        className="city-field"
        aria-label="City"
        aria-expanded={open && !disabled}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && cities[active] ? optId(active) : undefined
        }
        placeholder="Search a city"
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        value={draft ?? shown}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!cities.length) return;
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + cities.length) % cities.length);
          } else if (e.key === "Enter") {
            if (open && cities[active]) {
              e.preventDefault();
              choose(cities[active]);
            }
          }
        }}
      />
      {shown && !disabled ? (
        <button
          type="button"
          className="city-clear"
          aria-label="Clear city"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            close();
            onPick(null);
          }}
        >
          <LuX size={13} aria-hidden />
        </button>
      ) : null}
      {open && !disabled && container && box
        ? createPortal(
            <div
              className="nx-pop is-right city-pop"
              style={box}
              onMouseDown={(e) => e.preventDefault()}
            >
              {cities.length > 0 ? (
                <ul id={listId} role="listbox" aria-label="Cities">
                  {cities.map((c, i) => (
                    <li
                      key={`${c.latitude},${c.longitude}`}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      className="city-opt"
                      data-active={i === active ? "" : undefined}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(c)}
                    >
                      <span className="city-opt-main">
                        <span className="city-opt-name">{c.name}</span>
                        {citySubline(c) ? (
                          <span className="city-opt-sub">{citySubline(c)}</span>
                        ) : null}
                      </span>
                      {c.countryCode ? (
                        <span className="city-opt-code">{c.countryCode}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <ul id={listId} role="listbox" aria-label="Cities" hidden />
                  <p className="city-note" role="status">
                    {note}
                  </p>
                </>
              )}
            </div>,
            container
          )
        : null}
    </span>
  );
}
