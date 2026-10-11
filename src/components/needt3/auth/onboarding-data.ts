/* What the onboarding steps offer, shared by the desktop and the phone face. */
import type { ArtName } from "../menu/Art";

export const USES: ReadonlyArray<readonly [string, string, string, ArtName]> = [
  ["work", "Work", "Projects, meetings and the tasks between them", "work"],
  [
    "personal",
    "Personal",
    "Errands, habits and the things you keep meaning to do",
    "home",
  ],
  [
    "side",
    "Side business",
    "Listings, orders and the work around a second income",
    "stack",
  ],
];

/** Calendars with a real connect flow today. Apple (CalDAV) needs its own form. */
export const CALS: ReadonlyArray<{
  id: string;
  provider: string;
  title: string;
  sub: string;
  art: ArtName;
  href: string | null;
}> = [
  {
    id: "google",
    provider: "google",
    title: "Google Calendar",
    sub: "Two-way sync with your Google account",
    art: "event",
    href: "/api/calendar/google/auth",
  },
  {
    id: "apple",
    provider: "caldav",
    title: "Apple Calendar",
    sub: "iCloud calendars — connect from Settings",
    art: "calendarfile",
    href: null,
  },
  {
    id: "outlook",
    provider: "outlook",
    title: "Outlook",
    sub: "Microsoft 365 or Outlook.com",
    art: "mail",
    href: "/api/calendar/outlook/auth",
  },
];
