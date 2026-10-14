import { SECTION_TITLES, type SectionKey } from "@/lib/needt3/section-titles";

const ROUTE_SECTIONS: Record<string, SectionKey> = {
  "/calendar": "calendar",
  "/tasks": "tasks",
  "/projects": "projects",
  "/focus": "focus",
  "/settings": "settings",
  "/setup": "setup",
  "/auth/signin": "signIn",
  "/auth/reset-password": "resetPassword",
};

/**
 * The tab title of a section route: the section name alone. Null for any other
 * path, so the title the server rendered (a document's own name, say) stays.
 */
export const getTitleFromPathname = (pathname: string): string | null => {
  const section = ROUTE_SECTIONS[pathname];
  return section ? SECTION_TITLES[section] : null;
};
