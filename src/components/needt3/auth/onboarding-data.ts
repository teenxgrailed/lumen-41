/* What the onboarding steps offer, shared by the desktop and the phone face. */
import type { ArtName } from "../menu/Art";

export const USES: ReadonlyArray<readonly [string, string, string, ArtName]> = [
  ["work", "Work", "Projects, meetings and the tasks between them", "work"],
  ["study", "Study", "Courses, reading and deadlines you plan around", "later"],
  [
    "personal",
    "Personal",
    "Errands, habits and the things you keep meaning to do",
    "home",
  ],
  [
    "side",
    "Side project",
    "Something of your own, built in the gaps of the week",
    "stack",
  ],
];

/** Calendars with a real connect flow. iCloud (CalDAV) has no OAuth screen: it opens the Connections form, with the guide shown first. */
export const CALS: ReadonlyArray<{
  id: string;
  provider: string;
  title: string;
  sub: string;
  art: ArtName;
  href: string | null;
  /** Needs keys on the server before it is shown; null = always available. */
  needs: "google" | "outlook" | null;
}> = [
  {
    id: "google",
    provider: "google",
    title: "Google Calendar",
    sub: "Two-way sync with your Google account",
    art: "event",
    href: "/api/calendar/google/auth",
    needs: "google",
  },
  {
    id: "apple",
    provider: "caldav",
    title: "iCloud Calendar",
    sub: "iCloud, with an app-specific password",
    art: "calendarfile",
    href: "/connections",
    needs: null,
  },
  {
    id: "outlook",
    provider: "outlook",
    title: "Outlook",
    sub: "Microsoft 365 or Outlook.com",
    art: "mail",
    href: "/api/calendar/outlook/auth",
    needs: "outlook",
  },
];
