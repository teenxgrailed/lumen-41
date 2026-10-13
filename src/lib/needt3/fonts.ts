import { Newsreader, Nunito } from "next/font/google";
import localFont from "next/font/local";

/**
 * Design v3 faces, exposed as CSS variables on the `.needt-v3` scope element.
 *
 * - Exposure (205TF) is the display face and the wordmark's own. The file is
 *   the licensed web font (see public/fonts/README.md for why its name
 *   records still say "Trial"). The vendored CSS refers to it as
 *   `var(--font-v3-exposure)`; the sync script rewrites the prototype's
 *   `"Exposure VAR"` family name to that. No Cyrillic: never put a
 *   translatable string in it.
 * - Newsreader and Nunito are the document fonts "Serif" and "Rounded"
 *   (prototype doc-style.jsx DC_FONTS).
 *
 * `preload: false` on all three: this module is imported by the (app) layout
 * whether or not the flag is on, and a preload would make every flag-off page
 * download faces it never uses. //todo flip Exposure to preload when v3 ships.
 *
 * Inter, Instrument Serif and JetBrains Mono (`--font-sans/-display/-mono`)
 * still come from the design system's own font import, loaded by the v2 layer.
 */
export const exposure = localFont({
  src: "../../../public/fonts/ExposureVAR.woff2",
  variable: "--font-v3-exposure",
  display: "block",
  fallback: ["Georgia", "serif"],
  preload: false,
});

export const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-v3-serif",
  display: "swap",
  preload: false,
  fallback: ["Iowan Old Style", "Georgia", "serif"],
});

export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-v3-rounded",
  display: "swap",
  preload: false,
  fallback: ["ui-rounded", "SF Pro Rounded", "system-ui", "sans-serif"],
});

/** Class names that define the three variables; put them on the scope element. */
export const V3_FONT_CLASSES = [
  exposure.variable,
  newsreader.variable,
  nunito.variable,
].join(" ");
