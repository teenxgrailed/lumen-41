"use client";

import {
  type CSSProperties,
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// One entry, so the vendored CSS always loads before the port's overrides.
import "@/styles/v3-entry.css";

import { newDate } from "@/lib/date-utils";
import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";
import {
  LOOK_BOOT_SCRIPT,
  type Look,
  PHONE_GROUND,
  barColorOf,
  firstPaint,
  writeLookCookie,
} from "@/lib/needt3/look-boot";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import {
  type TimeReading,
  placeFromTz,
  readTimePalettes,
  resolveTheme,
  timeThemeAt,
} from "@/lib/needt3/theme";

import { useNeedt3Ui } from "@/store/needt3-ui";

// V3Shell imports the motion overrides, so they load after index.css
// (an import sorter cannot reorder them past it from there).
import { PaywallHost } from "../paywall/PaywallHost";
import { V3Shell } from "../shell/V3Shell";
import { LocaleFirstRun } from "./LocaleFirstRun";
import { PwaBridge } from "./PwaBridge";
import { PhoneUiProvider, useResolvedPhoneUi } from "./phone-ui-context";

/**
 * True inside the v3 frame. The layout decides once per request on the server
 * (signed in or not) and the answer arrives here; client code asks this
 * context and never fetches flags.
 */
const DesignV3Context = createContext(false);

export function useDesignV3() {
  return useContext(DesignV3Context);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const TIME_TICK_MS = 60_000;

function useOsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    setDark(mq.matches);
    const read = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return dark;
}

/** The Time reading, recomputed once a minute while Time is chosen. */
function useTimeReading(
  enabled: boolean,
  scopeRef: React.RefObject<HTMLDivElement | null>
) {
  const [reading, setReading] = useState<TimeReading | null>(null);
  useEffect(() => {
    if (!enabled || !scopeRef.current) {
      setReading(null);
      return undefined;
    }
    const el = scopeRef.current;
    const place = placeFromTz();
    const palettes = readTimePalettes(el);
    if (!palettes.day.bg) return undefined; // tokens not loaded: stay put
    const read = () => setReading(timeThemeAt(newDate(), place, palettes));
    read();
    const id = window.setInterval(read, TIME_TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, scopeRef]);
  return reading;
}

/**
 * The v3 frame: the `.needt-v3` scope element every v3 screen renders in.
 * It carries the theme (`data-theme`, `data-drift`), the accent and the font
 * variables. Providers (session, TanStack Query, workspace) come from the
 * root layout and are shared with the old shell; v3 query keys are prefixed
 * `["v3", …]`, so the two never share cache entries.
 */
export function V3Root({
  children,
  initialUi = "desktop",
  uiForced = false,
  initialLook,
}: PropsWithChildren<{
  /** The server's pick (`phoneUiFrom`); the first render, so hydration matches. */
  initialUi?: PhoneUi;
  /** The `needt-ui` cookie pinned `initialUi`: the width never overrides it. */
  uiForced?: boolean;
  /**
   * The saved theme and accent as the server read them. The first render
   * wears these (so the HTML is already in the person's colours and hydration
   * matches), then the store takes over, seeded with them.
   */
  initialLook?: Look;
}>) {
  const ui = useResolvedPhoneUi(initialUi, uiForced);
  const scopeRef = useRef<HTMLDivElement>(null);
  const storeTheme = useNeedt3Ui((s) => s.theme);
  const storeAccent = useNeedt3Ui((s) => s.accent);
  // Until the store has been seeded from the server's look, the persisted
  // localStorage copy (possibly stale, or empty on a new device) is not worn.
  const [seeded, setSeeded] = useState(!initialLook);
  useEffect(() => {
    if (initialLook) {
      useNeedt3Ui
        .getState()
        .setLook({ theme: initialLook.choice, accent: initialLook.accent });
    }
    setSeeded(true);
    // Once, on mount: the server's read is the starting point, not a feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const theme = seeded || !initialLook ? storeTheme : initialLook.choice;
  const accent = seeded || !initialLook ? storeAccent : initialLook.accent;
  const osDark = useOsDark();
  const time = useTimeReading(theme === "time", scopeRef);
  // Time has no reading until its effect has read the palette tokens; until
  // then wear what the server painted rather than resolving to Light.
  const server =
    initialLook && initialLook.choice === theme
      ? firstPaint(initialLook)
      : null;
  const waiting = !seeded || (theme === "time" && !time);
  const resolved =
    server && waiting && theme !== "system"
      ? server
      : resolveTheme(theme, osDark, time);
  const vars: Record<string, string> = resolved.vars;

  // The phone's page is its own ground (Safari 26 tints its bars from the page
  // colour, and nothing on the phone is fixed at an edge): the desktop's
  // `--background` would be a lighter strip behind it.
  const barColor =
    ui === "phone"
      ? PHONE_GROUND[resolved.side]
      : barColorOf({ side: resolved.side, vars });
  useEffect(() => {
    // The status bar / PWA frame follow the chosen theme, not the OS scheme
    // the static viewport metadata keys on (Time at dusk, Dark on a light OS).
    const metas = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]'
      )
    );
    const saved = metas.map((m) => m.getAttribute("content"));
    metas.forEach((m) => m.setAttribute("content", barColor));
    return () =>
      metas.forEach((m, i) => {
        if (saved[i] !== null) m.setAttribute("content", saved[i] as string);
      });
  }, [barColor]);

  // The page behind the scope (html, body) and the browser's own controls
  // wear the theme too, so overscroll and the gap before CSS are not the
  // static dark root. The boot script paints the first frame; this keeps it
  // in step afterwards.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const before = [
      html.style.backgroundColor,
      html.style.colorScheme,
      body.style.backgroundColor,
    ];
    // `<meta name="color-scheme">` is the server's answer for the first byte;
    // Safari reads it for its own bars, so it follows the theme live.
    let schemeMeta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="color-scheme"]'
    );
    let schemeAdded = false;
    if (!schemeMeta) {
      schemeMeta = document.createElement("meta");
      schemeMeta.name = "color-scheme";
      document.head.appendChild(schemeMeta);
      schemeAdded = true;
    }
    const schemeBefore = schemeMeta.getAttribute("content");
    html.style.backgroundColor = barColor;
    html.style.colorScheme = resolved.side;
    body.style.backgroundColor = barColor;
    schemeMeta.setAttribute("content", resolved.side);
    const meta = schemeMeta;
    return () => {
      html.style.backgroundColor = before[0];
      html.style.colorScheme = before[1];
      body.style.backgroundColor = before[2];
      if (schemeAdded) meta.remove();
      else if (schemeBefore !== null)
        meta.setAttribute("content", schemeBefore);
    };
  }, [barColor, resolved.side]);

  // The browser's copy of the look: the next first byte (and generateViewport)
  // start from how this one resolved.
  const palette = time && !time.pure ? time.palette : null;
  const paletteKey = palette
    ? `${palette.bg}${palette.raised}${palette.ink}`
    : "";
  useEffect(() => {
    if (!seeded) return;
    writeLookCookie({
      choice: theme,
      accent,
      side: resolved.side,
      palette: palette
        ? { bg: palette.bg, raised: palette.raised, ink: palette.ink }
        : null,
    });
    // `palette` is keyed by its three colours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, theme, accent, resolved.side, paletteKey]);

  return (
    <DesignV3Context.Provider value={true}>
      <div
        ref={scopeRef}
        // pt-[var(--needt-top-banner)]: start below a fixed top banner (the
        // email confirmation, EmailVerificationGate's TOP_BANNER_VAR) instead
        // of under it; 0 when there is none.
        className={`needt-v3 ${V3_FONT_CLASSES} relative z-10 flex flex-col pt-[var(--needt-top-banner,0px)] ${
          // Phone: the document scrolls, so the scope grows with its content.
          ui === "phone" ? "min-h-dvh" : "h-dvh min-h-0 overflow-hidden"
        }`}
        data-theme={resolved.side}
        data-drift={resolved.drift ? "on" : undefined}
        data-accent={accent}
        data-theme-choice={theme}
        data-ui={ui}
        data-time-known={server?.known ? "1" : undefined}
        style={vars as CSSProperties}
        suppressHydrationWarning
      >
        {/* First child: settles System and Time before anything below paints. */}
        <script
          dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }}
          suppressHydrationWarning
        />
        <PhoneUiProvider value={ui}>
          <V3Shell ui={ui}>{children}</V3Shell>
        </PhoneUiProvider>
        {/* Permanent: a sibling of the shell, so no UI change reaches it. */}
        <PaywallHost />
        <PwaBridge />
        <LocaleFirstRun />
      </div>
    </DesignV3Context.Provider>
  );
}
