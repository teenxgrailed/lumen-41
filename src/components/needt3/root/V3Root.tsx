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

import { TOP_BANNER_VAR } from "@/components/auth/EmailVerificationGate";

import { newDate } from "@/lib/date-utils";
import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";
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
import { PhoneUiProvider, useResolvedPhoneUi } from "./phone-ui-context";

/**
 * True inside the v3 frame. The flag is read once per request on the server
 * (`isDesignV3`) and arrives here through the layout; client code asks this
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
}: PropsWithChildren<{
  /** The server's pick (`phoneUiFrom`); the first render, so hydration matches. */
  initialUi?: PhoneUi;
  /** The `needt-ui` cookie pinned `initialUi`: the width never overrides it. */
  uiForced?: boolean;
}>) {
  const ui = useResolvedPhoneUi(initialUi, uiForced);
  const scopeRef = useRef<HTMLDivElement>(null);
  const theme = useNeedt3Ui((s) => s.theme);
  const accent = useNeedt3Ui((s) => s.accent);
  const osDark = useOsDark();
  const time = useTimeReading(theme === "time", scopeRef);
  const resolved = resolveTheme(theme, osDark, time);

  return (
    <DesignV3Context.Provider value={true}>
      <div
        ref={scopeRef}
        className={`needt-v3 ${V3_FONT_CLASSES} relative z-10 flex h-dvh min-h-0 flex-col overflow-hidden`}
        data-theme={resolved.side}
        data-drift={resolved.drift ? "on" : undefined}
        data-accent={accent}
        data-theme-choice={theme}
        data-ui={ui}
        style={
          {
            ...(resolved.vars as CSSProperties),
            // Start below a fixed top banner (email confirmation) instead of
            // under it; 0 when there is none.
            paddingTop: `var(${TOP_BANNER_VAR}, 0px)`,
          } as CSSProperties
        }
        suppressHydrationWarning
      >
        <PhoneUiProvider value={ui}>
          <V3Shell ui={ui}>{children}</V3Shell>
        </PhoneUiProvider>
        {/* Permanent: a sibling of the shell, so no UI change reaches it. */}
        <PaywallHost />
      </div>
    </DesignV3Context.Provider>
  );
}
