import { ACCENTS, type AccentId, DEFAULT_ACCENT } from "./theme";

/**
 * Human names for the colour tokens a swatch is drawn with. A swatch has no
 * text, so its accessible name (and tooltip) comes from here, never the raw
 * token ("info", "destructive"). `accent` is whatever accent the person has
 * picked, so it reads "Pink" when the app is pink.
 */
export const COLOUR_NAMES: Readonly<Record<string, string>> = {
  info: "Amber",
  success: "Green",
  destructive: "Red",
  muted: "Grey",
};

export function colourName(
  token: string,
  accent: AccentId = DEFAULT_ACCENT
): string {
  if (token === "accent")
    return ACCENTS.find((a) => a.id === accent)?.label ?? "Blue";
  return COLOUR_NAMES[token] ?? token;
}
