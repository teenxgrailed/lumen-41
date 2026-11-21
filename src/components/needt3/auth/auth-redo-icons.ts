import type { IconType } from "react-icons";

import { brandGlyph, brandMonoGlyph } from "../brand";

/** The real mark of each third-party button the redo draws, whether or not the
    provider is wired (`brand/data.ts` holds the official artwork). */
export const REDO_ICONS: Readonly<Record<string, IconType>> = {
  google: brandGlyph("google"),
  apple: brandMonoGlyph("apple"),
  "azure-ad": brandGlyph("microsoft"),
  openai: brandMonoGlyph("chatgpt"),
};
