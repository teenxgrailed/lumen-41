"use client";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  Children,
  type ElementType,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { LuChevronDown } from "react-icons/lu";

import { Art, type ArtName } from "../../menu/Art";
import { PxSky } from "../../scenes";
import { PlaceGlyph } from "../../shell/PlaceGlyph";
import { useFlipRows } from "./flip";
import { usePkSkyMood } from "./theme";
import { pkCx, pkReduced } from "./util";

/* ══ Numbers ═══════════════════════════════════════════════════════════════ */

/**
 * Rolling digits: each digit a 0–9 strip that moves on change only. `value`
 * may hold non-digits ("9 h"). Keys count from the right, so 9 → 10 rolls
 * the ones.
 */
export function PkNumber({
  value,
  className,
  label,
}: {
  value: string | number;
  className?: string;
  label?: string;
}) {
  const chars = String(value).split("");
  const n = chars.length;
  return (
    <span
      className={pkCx("pk-num", className)}
      aria-label={label ?? String(value)}
      role="img"
    >
      {chars.map((c, i) => {
        const key = n - i;
        if (!/\d/.test(c))
          return (
            <span key={`c${key}${c}`} className="pk-num-ch" aria-hidden="true">
              {c}
            </span>
          );
        return (
          <span key={`d${key}`} className="pk-num-d" aria-hidden="true">
            <span className="pk-num-sizer">0</span>
            <span
              className="pk-num-strip"
              style={{ "--d": +c } as CSSProperties}
            >
              {"0123456789".split("").map((x) => (
                <span key={x}>{x}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ══ The sky ═══════════════════════════════════════════════════════════════
   The brand sky (scenes/PxSky) as a small accent on the calm ground, at the
   phone's 15 fps. It follows the APP theme and the time of day (usePkSkyMood),
   never the inverse plate it sits on. The plate keeps `data-px-scope`: the
   engine writes the sky's ink (--px-ink …) on the nearest such ancestor, and
   rests after 12 s without input, pauses off screen and when covered. */

type SkyProps = {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  radius?: number;
  onClick?: () => void;
  type?: string;
} & Record<`data-${string}` | `aria-${string}`, string | undefined>;

/** A plate whose ground is the sky (Home's Next up). */
export function PkSkyPlate(props: SkyProps) {
  const { as, className, children, radius, ...rest } = props;
  const sky = usePkSkyMood();
  const Tag = (as ?? "section") as ElementType;
  const pass: Record<string, unknown> = {};
  for (const k of Object.keys(rest)) {
    if (
      k.startsWith("data-") ||
      k.startsWith("aria-") ||
      k === "onClick" ||
      k === "type"
    )
      pass[k] = (rest as Record<string, unknown>)[k];
  }
  return (
    <Tag
      className={pkCx("pk-plate pk-skyplate", className)}
      data-px-scope=""
      data-px-night={sky.dark ? "1" : undefined}
      style={{ borderRadius: radius ?? 26 }}
      {...pass}
    >
      <PxSky
        horizon="none"
        fps={15}
        radius={radius ?? 26}
        mood={sky.mood ?? undefined}
        dark={sky.dark}
        className="pk-skyplate-sky"
      />
      <div className="pk-skyplate-in">{children}</div>
    </Tag>
  );
}

/** A small window of sky: the reward on an empty / finished list. */
export function PkSkyBadge({ className }: { className?: string }) {
  const sky = usePkSkyMood();
  return (
    <span
      className={pkCx("pk-skybadge", className)}
      data-px-scope=""
      data-px-night={sky.dark ? "1" : undefined}
      aria-hidden="true"
      data-pk-skybadge=""
    >
      <PxSky
        horizon="none"
        fps={15}
        radius={20}
        mood={sky.mood ?? undefined}
        dark={sky.dark}
      />
    </span>
  );
}

/**
 * A one-shot halftone sweep (≤ 400 ms, transform only; none under reduced
 * motion): a completed row (`row`), and a screen switch from menu A
 * (`screen`). Removes itself when it ends.
 */
export function PkSweep({ kind }: { kind?: "row" | "screen" }) {
  const [on, setOn] = useState(true);
  if (!on || pkReduced()) return null;
  return (
    <span
      className={pkCx("pk-sweep", `is-${kind ?? "row"}`)}
      aria-hidden="true"
      data-pk-sweep={kind ?? "row"}
    >
      <span className="pk-sweep-band" onAnimationEnd={() => setOn(false)} />
    </span>
  );
}

/**
 * The same sweep fired from a handler, with no component to mount: appends
 * one `.pk-sweep` to `target` (an element or a selector; default the phone's
 * screen host or the first `.pk-screen`) and removes it when it ends. No-op
 * under reduced motion.
 */
export function pkDotSweep(
  target?: Element | string | null,
  kind?: "row" | "screen"
) {
  if (pkReduced() || typeof document === "undefined") return;
  let host: Element | null =
    typeof target === "string"
      ? document.querySelector(target)
      : (target ?? null);
  host =
    host ??
    document.querySelector("[data-v2p-host]") ??
    document.querySelector(".pk-screen");
  if (!host) return;
  const el0 = host as HTMLElement;
  if (window.getComputedStyle(el0).position === "static")
    el0.style.position = "relative";
  const k = kind === "row" ? "row" : "screen";
  const el = document.createElement("span");
  el.className = `pk-sweep is-${k}`;
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("data-pk-sweep", k);
  const band = document.createElement("span");
  band.className = "pk-sweep-band";
  el.appendChild(band);
  const done = () => el.parentNode?.removeChild(el);
  band.addEventListener("animationend", done);
  window.setTimeout(done, 700); // a hidden tab never ends the animation
  host.appendChild(el);
}

/* ══ Colour: the section glyph tile ═══════════════════════════════════════ */

const PLACE_HUE: Record<string, string> = {
  home: "var(--accent)",
  tasks: "var(--accent)",
  calendar: "var(--destructive)",
  mail: "var(--info)",
  docs: "var(--success)",
  ask: "var(--v2p-lav)",
  habits: "var(--success)",
  moodboards: "var(--destructive)",
  projects: "var(--pk-violet)",
  templates: "var(--pk-violet)",
  shared: "var(--info)",
  trash: "var(--destructive)",
  connections: "var(--info)",
  settings: "var(--v2p-ink-2)",
};
const KIND_HUE: Record<string, string> = {
  doc: "var(--success)",
  page: "var(--success)",
  folder: "var(--accent)",
  template: "var(--pk-violet)",
  task: "var(--accent)",
  event: "var(--destructive)",
  mail: "var(--info)",
};
const GLYPH_PX = { s: 32, m: 44, l: 56, xl: 72 } as const;

/** Phone place id → the shell's drawn mark, or the illustration to use. */
const PLACE_MARK: Record<string, string> = {
  home: "today",
  tasks: "tasks",
  calendar: "calendar",
  mail: "mail",
  docs: "docs",
  moodboards: "moodboards",
  projects: "projects",
};
const PLACE_ART: Record<string, ArtName> = {
  ask: "focus",
  habits: "habit",
  templates: "template",
  shared: "stack",
  trash: "trash",
  connections: "import",
  settings: "tune",
};

export type PkGlyphSize = keyof typeof GLYPH_PX | number;

/**
 * The coloured section glyph tile: the shell's PlaceGlyph drawing (or an Art
 * illustration for a type) on a rounded tile washed with the place's hue.
 * Size s 32 · m 44 (default) · l 56 · xl 72, or px. Tone "tint" (default),
 * "glass" (frosted, for a sky or busy ground) or "plain".
 */
export function PkGlyph({
  place,
  kind,
  size,
  tone,
  className,
  label,
}: {
  place?: string;
  kind?: string;
  size?: PkGlyphSize;
  tone?: "tint" | "glass" | "plain";
  className?: string;
  label?: string;
}) {
  const px = typeof size === "number" ? size : (GLYPH_PX[size ?? "m"] ?? 44);
  const hue = place ? PLACE_HUE[place] : kind ? KIND_HUE[kind] : undefined;
  let art: ReactNode = null;
  if (place) {
    art = PLACE_MARK[place] ? (
      <PlaceGlyph id={PLACE_MARK[place]} />
    ) : (
      <Art name={PLACE_ART[place] ?? "page"} size={24} />
    );
  } else if (kind) {
    art = <Art name={kind as ArtName} size={24} />;
  }
  return (
    <span
      className={pkCx("pk-glyph", `is-${tone ?? "tint"}`, className)}
      data-pk-glyph={place ?? kind ?? ""}
      style={
        {
          "--pk-gl": `${px}px`,
          "--pk-gl-hue": hue ?? "var(--v2p-lav)",
        } as CSSProperties
      }
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <span className="pk-glyph-art">{art}</span>
    </span>
  );
}

/** The coloured tile alone, with a lucide-style icon node in it. */
export function PkHueTile({
  icon,
  hue,
  glyph,
  size,
}: {
  icon?: ReactNode;
  hue?: string;
  glyph?: string;
  size?: number;
}) {
  const px = size ?? 36;
  if (glyph) return <PkGlyph place={glyph} size={px} />;
  return (
    <span
      className="pk-glyph pk-hue-tile"
      aria-hidden="true"
      style={
        {
          "--pk-gl": `${px}px`,
          "--pk-gl-hue": hue ?? "var(--v2p-lav)",
        } as CSSProperties
      }
    >
      {icon}
    </span>
  );
}

/* ══ Glass: a frosted surface ══════════════════════════════════════════════
   Never put it under an ancestor with opacity / filter / mask: the blur would
   see nothing. */

export function PkGlass({
  as,
  className,
  strong,
  round,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  strong?: boolean;
  round?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled">) {
  const Tag = (as ?? "div") as ElementType;
  const type = Tag === "button" && !rest.type ? "button" : rest.type;
  return (
    <Tag
      className={pkCx(
        "pk-glass",
        strong && "is-strong",
        round && "is-round",
        className
      )}
      {...rest}
      type={type}
    >
      {children}
    </Tag>
  );
}

/* ══ Buttons and fields ═══════════════════════════════════════════════════ */

export type PkButtonKind = "primary" | "quiet" | "chip" | "ghost" | "inline";

/**
 * "primary" an inverse pill · "quiet" raised (default) · "chip" small 32px
 * raised · "ghost" small transparent · "inline" a 26px chip in a line of text.
 * Text is ellipsised. `icon` is a node (react-icons), drawn before the text.
 */
export function PkButton({
  kind,
  icon,
  small,
  block,
  className,
  children,
  type,
  ...rest
}: {
  kind?: PkButtonKind;
  icon?: ReactNode;
  small?: boolean;
  block?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const k = kind ?? "quiet";
  return (
    <button
      type={type ?? "button"}
      className={pkCx(
        "pk-btn",
        `is-${k}`,
        small && "is-small",
        block && "is-block",
        className
      )}
      {...rest}
    >
      {icon}
      {children != null ? <span className="pk-btn-cut">{children}</span> : null}
    </button>
  );
}

/** A field on the ground; `multiline` + `grow` = a textarea that fits its text. */
export function PkField({
  label,
  id,
  value,
  onChange,
  placeholder,
  multiline,
  rows,
  grow,
  className,
  inputProps,
}: {
  label?: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  grow?: boolean;
  className?: string;
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange"
  >;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !grow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, grow]);
  const cls = pkCx(
    "pk-field-input",
    multiline && "is-multi",
    grow && "is-grow"
  );
  return (
    <div className={pkCx("pk-field", className)}>
      {label ? (
        <label className="pk-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {multiline ? (
        <textarea
          id={id}
          ref={area}
          rows={rows ?? 2}
          value={value}
          placeholder={placeholder}
          className={cls}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          className={cls}
          {...inputProps}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** The quiet empty line, with a small sky vignette as the reward; `sky={false}` drops it. */
export function PkEmpty({
  title,
  line,
  action,
  sky,
}: {
  title?: string;
  line?: string;
  action?: ReactNode;
  sky?: boolean;
}) {
  const badge = sky === false ? null : <PkSkyBadge />;
  if (!title && !action) {
    if (!badge) return <p className="pk-empty">{line}</p>;
    return (
      <div className="pk-empty is-sky">
        {badge}
        <p className="pk-empty-line">{line}</p>
      </div>
    );
  }
  return (
    <div className="pk-empty is-block">
      {badge}
      {title ? <p className="pk-empty-title">{title}</p> : null}
      {line ? <p className="pk-empty-line">{line}</p> : null}
      {action ? <div className="pk-empty-action">{action}</div> : null}
    </div>
  );
}

/* ══ Sections ══════════════════════════════════════════════════════════════ */

/**
 * A quiet uppercase label (or, with `big`, one big word) + count + one
 * action; with `onFold` it folds (chevron). Rows get a top hairline.
 */
export function PkSection({
  title,
  count,
  tone,
  action,
  folded,
  onFold,
  big,
  glyph,
  children,
  className,
}: {
  title: string;
  count?: number | string;
  tone?: "late";
  action?: ReactNode;
  folded?: boolean;
  onFold?: () => void;
  big?: boolean;
  glyph?: string;
  children?: ReactNode;
  className?: string;
}) {
  const rows = useRef<HTMLDivElement>(null);
  // the rows below a removed one slide up instead of the list animating height
  useFlipRows(
    rows,
    Children.toArray(children)
      .map((c) => (isValidElement(c) ? String(c.key) : ""))
      .join("|")
  );
  const label = (
    <>
      {glyph ? (
        <PkGlyph
          place={glyph}
          size={big ? "m" : "s"}
          className="pk-sec-glyph"
        />
      ) : null}
      <span
        className={pkCx(
          big ? "pk-sec-word" : "pk-label",
          tone === "late" && "is-late"
        )}
      >
        {title}
      </span>
      {count ? <span className="pk-sec-count">{count}</span> : null}
    </>
  );
  return (
    <section className={pkCx("pk-sec", big && "is-big", className)}>
      <header className="pk-sec-head">
        {onFold ? (
          <button
            type="button"
            className="pk-sec-fold"
            onClick={onFold}
            aria-expanded={!folded}
          >
            {label}
            <span
              className={pkCx("pk-sec-chev", folded && "is-folded")}
              aria-hidden="true"
            >
              <LuChevronDown size={14} />
            </span>
          </button>
        ) : (
          <span className="pk-sec-fold is-static">{label}</span>
        )}
        {action ? <span className="pk-sec-action">{action}</span> : null}
      </header>
      {folded ? null : (
        <div ref={rows} className="pk-sec-rows">
          {children}
        </div>
      )}
    </section>
  );
}

/* ══ Chips with blurred edges ══════════════════════════════════════════════ */

/**
 * A horizontal strip whose left / right edges fade into a progressive blur,
 * only on the side that has more. One ResizeObserver on the strip.
 */
export function PkChips({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sc = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = sc.current;
    const b = box.current;
    if (!el || !b) return undefined;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      b.setAttribute("data-pk-left", el.scrollLeft > 2 ? "1" : "0");
      b.setAttribute("data-pk-right", el.scrollLeft < max - 2 ? "1" : "0");
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  });
  const edge = (side: "left" | "right") => (
    <span className={`pk-edge is-${side}`} aria-hidden="true">
      <span className="pk-edge-blur is-1" />
      <span className="pk-edge-blur is-2" />
      <span className="pk-edge-wash" />
    </span>
  );
  return (
    <div
      ref={box}
      className={pkCx("pk-chips", className)}
      data-pk-left="0"
      data-pk-right="0"
    >
      <div
        ref={sc}
        className="pk-chips-scroll"
        role={label ? "group" : undefined}
        aria-label={label}
      >
        {children}
      </div>
      {edge("left")}
      {edge("right")}
    </div>
  );
}
