/**
 * Browser tab titles for the app. A tab says only where you are: the section
 * name, no product suffix, so a row of tabs reads as a row of places (the
 * icon already says it is Needt). Labels come from the shell's own places so a
 * rename in the sidebar renames the tab; routes outside the sidebar are listed
 * here. The root default (APP_TITLE) is for pages with no section.
 */
import type { Metadata } from "next";

import { PLACES, type PlaceId } from "@/components/needt3/shell/places";

const PLACE_TITLES = Object.fromEntries(
  PLACES.map((p) => [p.id, p.label])
) as Record<PlaceId, string>;

export const SECTION_TITLES = {
  ...PLACE_TITLES,
  connections: "Connections",
  settings: "Settings",
  setup: "Setup",
  signIn: "Sign in",
  resetPassword: "Reset password",
  confirmEmail: "Confirm email",
  chat: "Chat",
  focus: "Focus",
  quickAdd: "Quick add",
  operations: "Operations",
  system: "System settings",
  connectApp: "Connect an app",
  notFound: "Not found",
} as const;

export type SectionKey = keyof typeof SECTION_TITLES;

/** `export const metadata = sectionMetadata("calendar")`. */
export function sectionMetadata(key: SectionKey): Metadata {
  return { title: SECTION_TITLES[key] };
}

/** An item's own name when it has one, else its section's. */
export function itemTitle(
  name: string | null | undefined,
  section: SectionKey
): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : SECTION_TITLES[section];
}
