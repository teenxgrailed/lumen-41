"use client";

import {
  type CSSProperties,
  type ReactNode,
  createElement,
  useId,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { IconType } from "react-icons";
import { LuPlug } from "react-icons/lu";

import { format, newDate, toLocalDateKey } from "@/lib/date-utils";

import { NeedtAppIcon } from "../wordmark/AppIcon";
import { BRAND_ART, type BrandArtId, type BrandNode } from "./data";
import { type BrandId, hasBrandIcon } from "./ids";

/**
 * A brand's mark on the tile the app's own icon sits on: a rounded square
 * (radius 22% of the size) that is white for a full-colour mark and the
 * brand's colour for a white one, so it reads on every theme. Fixed square,
 * no animation, nothing that can shift the layout.
 *
 * The brands' colours are content and live in `data.ts`. An id we have no mark
 * for (a toolkit the server lists before we draw it) gets the generic
 * connection tile: a plug on the quiet tile, never a made-up logo.
 *
 * Decorative unless `title` is given (then an image named `title`): put the
 * name in `title` only where no text beside it already says it.
 */
export interface BrandIconProps {
  id: BrandId | string | null | undefined;
  size?: number;
  title?: string;
  /** Apple Calendar only: the day it shows. Defaults to today. */
  date?: Date;
}

const WHITE = "#FFFFFF";

const RING_ON_LIGHT =
  "var(--black-a10) 0 0 0 1px inset, var(--black-a6) 0 1px 2px";
const RING_ON_DARK =
  "var(--white-a14) 0 0 0 1px inset, var(--black-a10) 0 1px 2px";

function tileStyle(size: number, bg: string | undefined): CSSProperties {
  const light = bg === WHITE;
  return {
    position: "relative",
    flex: "none",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    boxSizing: "border-box",
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.22),
    background: bg,
    boxShadow: light ? RING_ON_LIGHT : RING_ON_DARK,
  };
}

const isArt = (id: unknown): id is BrandArtId =>
  hasBrandIcon(id as string) && id !== "ical" && id !== "needt";

/** The mark keeps its own proportions inside a square of `z`; one decimal. */
function fit(box: readonly number[], z: number): [number, number] {
  const [, , w, h] = box;
  const r = (n: number) => Math.round(n * 10) / 10;
  return w >= h ? [r(z), r((z * h) / w)] : [r((z * w) / h), r(z)];
}

function gradient(stops: readonly string[]): string {
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

/** Ids inside a mark (gradients, masks, filters) are made unique per instance. */
function scope(name: string, value: string, prefix: string): string {
  if (name === "id") return prefix + value;
  if (name === "href" && value.startsWith("#"))
    return `#${prefix}${value.slice(1)}`;
  return value.replace(
    /url\(#([^)]+)\)/g,
    (_, id: string) => `url(#${prefix}${id})`
  );
}

function build(node: BrandNode, prefix: string, key: number): ReactNode {
  const [tag, attrs, children] = node;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(attrs))
    props[name] =
      typeof value === "string" ? scope(name, value, prefix) : value;
  return createElement(
    tag,
    props,
    children?.map((child, i) => build(child, prefix, i))
  );
}

function MarkSvg({
  id,
  width,
  height,
}: {
  id: BrandArtId;
  width: number;
  height: number;
}) {
  const art = BRAND_ART[id];
  const prefix = `bi${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  const kids = useMemo(
    () => art.nodes.map((n, i) => build(n, prefix, i)),
    [art, prefix]
  );
  return (
    <svg
      width={width}
      height={height}
      viewBox={art.box.join(" ")}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      {kids}
    </svg>
  );
}

/* ---------- Apple Calendar: its own icon, weekday and today's date ---------- */

/** The local day, re-read when the page comes back or is focused; no timer. */
const dayListeners = new Set<() => void>();
let dayWatching = false;
const onWake = () => dayListeners.forEach((fn) => fn());

function subscribeDay(fn: () => void) {
  dayListeners.add(fn);
  if (!dayWatching) {
    dayWatching = true;
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
  }
  return () => {
    dayListeners.delete(fn);
    if (!dayListeners.size && dayWatching) {
      dayWatching = false;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    }
  };
}

/** The key is a string so the store only reports a change when the day changes. */
const dayNow = () => toLocalDateKey(newDate());
/** The server does not know the person's day: it draws the page blank. */
const dayServer = () => "";

function useToday(given: Date | undefined): Date | null {
  const key = useSyncExternalStore(subscribeDay, dayNow, dayServer);
  if (given) return given;
  return key ? newDate() : null;
}

function CalendarFace({ size, date }: { size: number; date: Date | null }) {
  const day = date ? format(date, "EEE").toUpperCase() : "";
  const num = date ? format(date, "d") : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", fontFamily: "var(--font-sans)" }}
    >
      <text
        x="50"
        y="30"
        textAnchor="middle"
        fontSize="19"
        fontWeight="600"
        letterSpacing="0.4"
        fill="#FF3B30"
      >
        {day}
      </text>
      <text
        x="50"
        y="76"
        textAnchor="middle"
        fontSize="50"
        fontWeight="400"
        letterSpacing="-1.5"
        fill="#1C1C1E"
      >
        {num}
      </text>
    </svg>
  );
}

function AppleCalendar({
  size,
  title,
  date,
}: {
  size: number;
  title?: string;
  date?: Date;
}) {
  const today = useToday(date);
  return (
    <span {...a11y("ical", title)} style={tileStyle(size, WHITE)}>
      <CalendarFace size={size} date={today} />
    </span>
  );
}

function a11y(id: string, title: string | undefined) {
  return title
    ? ({ role: "img", "aria-label": title, "data-brand-icon": id } as const)
    : ({ "aria-hidden": true, "data-brand-icon": id } as const);
}

/* ---------- the tiles ---------- */

export function BrandIcon({ id, size = 40, title, date }: BrandIconProps) {
  if (id === "ical")
    return <AppleCalendar size={size} title={title} date={date} />;

  if (id === "needt")
    return (
      <span
        {...a11y("needt", title)}
        style={{
          flex: "none",
          display: "grid",
          placeItems: "center",
          width: size,
          height: size,
        }}
      >
        <NeedtAppIcon size={size} />
      </span>
    );

  if (!isArt(id)) {
    return (
      <span
        {...a11y("generic", title)}
        style={{
          ...tileStyle(size, undefined),
          background: "var(--fill-3)",
          boxShadow: "var(--shadow-inset-ring)",
          color: "var(--text-secondary)",
        }}
      >
        <LuPlug size={Math.round(size * 0.46)} aria-hidden="true" />
      </span>
    );
  }

  const art = BRAND_ART[id];
  const bg = typeof art.bg === "string" ? art.bg : gradient(art.bg);
  const [width, height] = fit(art.box, size * art.scale);
  return (
    <span {...a11y(id, title)} style={tileStyle(size, bg)}>
      <MarkSvg id={id} width={width} height={height} />
    </span>
  );
}

/**
 * A full-colour mark with no tile, for a button that already is the surface
 * (the sign-in buttons). Only for marks that read on any surface, which is
 * Google's and Microsoft's. Shaped as a react-icons component so a place that
 * takes an `IconType` takes this.
 */
export function brandGlyph(id: "google" | "microsoft"): IconType {
  function BrandGlyph({ size }: { size?: string | number }) {
    const [width, height] = fit(BRAND_ART[id].box, Number(size) || 16);
    return <MarkSvg id={id} width={width} height={height} />;
  }
  return BrandGlyph as IconType;
}
