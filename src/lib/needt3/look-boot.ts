/**
 * The look (theme + accent) before the client knows anything: what the server
 * renders into the `.needt-v3` scope, what the page tells the browser chrome
 * (`color-scheme`, `theme-color`), and the pre-paint script that settles the
 * two answers only the browser has (the OS scheme, the clock).
 *
 * The person's choice itself is never changed here. `UserSettings` is read by
 * the server (`request-look.ts`); the `needt-look` cookie is the browser's
 * copy of the last resolved look, so the first byte of HTML is already in the
 * right colours, and so is `generateViewport`, which cannot reach the DB
 * cheaply. Pure and client-safe: no DOM at import time, no server imports.
 */
import { PHONE_MEDIA_QUERY } from "@/lib/needt3/phone-ui";
import {
  type AccentId,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  type ThemeChoice,
  type ThemeSide,
  normalizeAccent,
  normalizeTheme,
  paletteVars,
} from "@/lib/needt3/theme";

export const LOOK_COOKIE = "needt-look";
const LOOK_MAX_AGE_S = 60 * 60 * 24 * 365;

/** The page colour of each side with no Time palette on top (themes.css). */
export const SIDE_BG: Record<ThemeSide, string> = {
  light: "#fcfdfe",
  dark: "#202022",
};

/**
 * The phone's ground (`--v2p-ground`, themes.css): what the screen is painted
 * with. The page behind it (`html`, `body`, the status and home-indicator
 * areas, the browser's bar) must be this colour, not `SIDE_BG`, or a lighter
 * strip shows under the floating bar. A test holds it equal to the CSS.
 */
export const PHONE_GROUND: Record<ThemeSide, string> = {
  light: "#f6f6f3",
  dark: "#141416",
};

/** Viewports narrower than the phone UI's breakpoint. */
export const PHONE_MEDIA = PHONE_MEDIA_QUERY;

/** Time's current bg / raised / ink, bare hex. Absent at full day and night. */
export interface LookPalette {
  bg: string;
  raised: string;
  ink: string;
}

export interface Look {
  choice: ThemeChoice;
  accent: AccentId;
  /**
   * The side last worn. Authoritative for Light and Dark, a first guess for
   * Time (the script and the effect refine it), only a guess for System.
   */
  side: ThemeSide | null;
  palette: LookPalette | null;
}

export const DEFAULT_LOOK: Look = {
  choice: DEFAULT_THEME,
  accent: DEFAULT_ACCENT,
  side: null,
  palette: null,
};

const HEX = /^[0-9a-f]{6}$/i;

/** `choice.side.accent[.bg.raised.ink]`, hex without the `#`. */
export function encodeLook(look: Look): string {
  const parts: string[] = [look.choice, look.side ?? "-", look.accent];
  if (look.palette) {
    const { bg, raised, ink } = look.palette;
    parts.push(bg, raised, ink);
  }
  return parts.map((p) => p.replace(/^#/, "")).join(".");
}

export function parseLook(raw: string | null | undefined): Look | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [choice, side, accent, bg, raised, ink] = value.split(".");
  if (
    choice !== "system" &&
    choice !== "light" &&
    choice !== "dark" &&
    choice !== "time"
  ) {
    return null;
  }
  const palette =
    choice === "time" && [bg, raised, ink].every((h) => h && HEX.test(h))
      ? { bg: `#${bg}`, raised: `#${raised}`, ink: `#${ink}` }
      : null;
  return {
    choice: normalizeTheme(choice),
    accent: normalizeAccent(accent),
    side: side === "light" || side === "dark" ? side : null,
    palette,
  };
}

/**
 * The saved choice (the DB, the truth) with what the cookie remembers about
 * how it resolved. A cookie written for another choice says nothing here.
 */
export function mergeLook(
  saved: { choice: ThemeChoice; accent: AccentId } | null,
  cookie: Look | null
): Look {
  if (!saved) return cookie ?? DEFAULT_LOOK;
  const same = cookie && cookie.choice === saved.choice;
  return {
    choice: saved.choice,
    accent: saved.accent,
    side: same ? cookie.side : null,
    palette: same ? cookie.palette : null,
  };
}

export interface FirstPaint {
  side: ThemeSide;
  drift: boolean;
  vars: Record<string, string>;
  /** True when Time's side comes from a past visit, not a guess. */
  known: boolean;
}

/**
 * What the scope wears in the server's HTML. Light and Dark are exact; System
 * and Time are the best the server can say and are settled before paint by
 * `LOOK_BOOT_SCRIPT`.
 */
export function firstPaint(look: Look): FirstPaint {
  if (look.choice === "light" || look.choice === "dark") {
    return { side: look.choice, drift: false, vars: {}, known: true };
  }
  if (look.choice === "system") {
    return {
      side: look.side ?? "light",
      drift: false,
      vars: {},
      known: false,
    };
  }
  const side = look.side ?? "light";
  const vars = look.palette
    ? paletteVars({ side, ...look.palette }, false)
    : {};
  return { side, drift: true, vars, known: look.side !== null };
}

/** The status bar / PWA frame colour for a first paint. */
export function barColorOf(paint: Pick<FirstPaint, "side" | "vars">): string {
  return paint.vars["--background"] ?? SIDE_BG[paint.side];
}

export interface ViewportLook {
  colorScheme: "light" | "dark" | "light dark";
  themeColor: Array<{ media?: string; color: string }>;
}

/** What `generateViewport` tells the browser chrome before any script runs. */
export function viewportLook(look: Look): ViewportLook {
  const paint = firstPaint(look);
  if (look.choice === "system") {
    return {
      colorScheme: "light dark",
      themeColor: [
        {
          media: `(prefers-color-scheme: light) and ${PHONE_MEDIA}`,
          color: PHONE_GROUND.light,
        },
        {
          media: `(prefers-color-scheme: dark) and ${PHONE_MEDIA}`,
          color: PHONE_GROUND.dark,
        },
        { media: "(prefers-color-scheme: light)", color: SIDE_BG.light },
        { media: "(prefers-color-scheme: dark)", color: SIDE_BG.dark },
      ],
    };
  }
  return {
    colorScheme: paint.side,
    themeColor: [
      { media: PHONE_MEDIA, color: PHONE_GROUND[paint.side] },
      { color: barColorOf(paint) },
    ],
  };
}

/**
 * Runs as the first child of `.needt-v3`, so before the first paint of
 * anything below it. Settles what the server could not: System follows the
 * OS, Time with no past visit follows the clock (a rough day/night cut that
 * the palette effect replaces within the first frame after hydration). It
 * also paints the page behind the scope (`html`, `body`) and sets
 * `color-scheme`, so overscroll, scrollbars and the gap before CSS are the
 * theme's, not the static dark root. Self-contained ES5 text.
 */
export const LOOK_BOOT_SCRIPT = `(function(){try{
var s=document.currentScript,e=s&&s.parentElement;if(!e)return;
var c=e.getAttribute("data-theme-choice"),d=e.getAttribute("data-theme")==="dark";
if(c==="system"){d=window.matchMedia("(prefers-color-scheme: dark)").matches}
else if(c==="time"&&e.getAttribute("data-time-known")!=="1"){var h=new Date().getHours();d=h<6||h>=20}
e.setAttribute("data-theme",d?"dark":"light");
var bg=e.style.getPropertyValue("--background")||(d?"${SIDE_BG.dark}":"${SIDE_BG.light}");
var r=document.documentElement;r.style.backgroundColor=bg;r.style.colorScheme=d?"dark":"light";
if(document.body)document.body.style.backgroundColor=bg;
}catch(x){}})();`;

/** Writes the browser's copy of the look (client only; failures are silent). */
export function writeLookCookie(look: Look): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOOK_COOKIE}=${encodeURIComponent(encodeLook(look))}; Path=/; Max-Age=${LOOK_MAX_AGE_S}; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked: the server falls back to the saved settings */
  }
}
