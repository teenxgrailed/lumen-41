/**
 * Phone Settings, the rules that decide things: the pill's three slots, what
 * Esc does, how a row summarises its page, and that the list reaches every
 * page the desktop sheet has.
 */
import type { V3Connection } from "@/lib/needt3/hooks/connections";

import { SECTION_TITLES, isDesktopSection } from "../../../settings/derive";
import {
  PILL_PLACES,
  PILL_SIZE,
  PS_LIST,
  PS_TITLES,
  alertsSummary,
  connectionMarks,
  connectionsLine,
  daySummary,
  escAction,
  isPsPage,
  themeWord,
  toggleSlot,
} from "../model";

describe("the pill's slots", () => {
  it("a tap takes the next free slot and saves only when the pill is full", () => {
    let m = toggleSlot([], "home");
    expect(m).toEqual({ slots: ["home"], save: false, blocked: false });
    m = toggleSlot(m.slots, "tasks");
    expect(m.save).toBe(false);
    m = toggleSlot(m.slots, "docs");
    expect(m).toEqual({
      slots: ["home", "tasks", "docs"],
      save: true,
      blocked: false,
    });
  });

  it("a fourth place is refused and changes nothing", () => {
    const full = ["home", "tasks", "docs"] as const;
    const m = toggleSlot(full, "mail");
    expect(m.blocked).toBe(true);
    expect(m.save).toBe(false);
    expect(m.slots).toEqual([...full]);
  });

  it("a tap on a place that is in leaves its slot and never saves a short list", () => {
    const m = toggleSlot(["home", "tasks", "docs"], "tasks");
    expect(m).toEqual({ slots: ["home", "docs"], save: false, blocked: false });
  });

  it("offers nine places, none of them Settings, and the pill holds three", () => {
    expect(PILL_SIZE).toBe(3);
    expect(PILL_PLACES).toHaveLength(9);
    expect(new Set(PILL_PLACES).size).toBe(9);
    expect(PILL_PLACES).not.toContain("settings");
  });
});

describe("Esc", () => {
  const base = {
    open: true,
    onPage: true,
    pickerOpen: false,
    otherSheetOpen: false,
  };
  it("goes back from a page", () => {
    expect(escAction(base)).toBe("back");
  });
  it("leaves it to the sheet on the list, over a picker or under the paywall, or when shut", () => {
    expect(escAction({ ...base, onPage: false })).toBe("leave");
    expect(escAction({ ...base, pickerOpen: true })).toBe("leave");
    expect(escAction({ ...base, otherSheetOpen: true })).toBe("leave");
    expect(escAction({ ...base, open: false })).toBe("leave");
  });
});

describe("the list", () => {
  it("reaches every desktop section once, plus the pill and Connections", () => {
    const rows = PS_LIST.flatMap((g) => g.rows);
    expect(new Set(rows).size).toBe(rows.length);
    // the Desktop group (island, widgets, ...) is the Mac app's, not the phone's
    const phone = Object.keys(SECTION_TITLES).filter(
      (id) => !isDesktopSection(id as keyof typeof SECTION_TITLES)
    );
    for (const id of phone) expect(rows).toContain(id);
    expect(rows).toContain("menu");
    expect(rows).toContain("connections");
    expect(rows).toHaveLength(phone.length + 2);
  });
  it("names the pages as the desktop does", () => {
    for (const [id, title] of Object.entries(SECTION_TITLES))
      expect(PS_TITLES[id as keyof typeof PS_TITLES]).toBe(title);
    expect(PS_TITLES.menu).toBe("Menu");
    expect(isPsPage("menu")).toBe(true);
    expect(isPsPage("plan")).toBe(true);
    expect(isPsPage("sidebar")).toBe(false);
  });
});

describe("summaries", () => {
  it("the day: hours once the schedule is known, the week start always", () => {
    expect(daySummary(undefined, "monday")).toBe("week from Monday");
    expect(daySummary({ workHourStart: 8, workHourEnd: 18 }, "sunday")).toBe(
      "08:00 – 18:00 · week from Sunday"
    );
  });
  it("alerts: what is on, or off", () => {
    const base = {
      dailyPlan: true,
      dailyPlanTime: "08:30",
      mailPlan: false,
      weeklyReview: true,
      reminders: true,
      mentions: true,
      system: true,
      channelInApp: true,
      channelPush: true,
      channelMac: true,
      emailNotifications: true,
      quietHours: false,
      quietStart: "22:00",
      quietEnd: "08:00",
      digest: false,
      digestTime: "08:00",
    };
    expect(alertsSummary(undefined)).toMatch(/focus ended/);
    expect(alertsSummary({ ...base, nudges: true, focusEnded: true })).toBe(
      "Overdue tasks, Focus ended"
    );
    expect(alertsSummary({ ...base, nudges: false, focusEnded: true })).toBe(
      "Focus ended"
    );
    expect(alertsSummary({ ...base, nudges: false, focusEnded: false })).toBe(
      "Off"
    );
  });
  it("the theme word", () => {
    expect(themeWord("time")).toBe("Time");
    expect(themeWord("system")).toBe("System");
  });
  it("connections: the count, and the first account that needs signing in again", () => {
    const c = (state: V3Connection["state"], label: string): V3Connection => ({
      provider: label,
      kind: "calendar",
      state,
      label,
      detail: null,
      accountId: null,
    });
    expect(connectionsLine(undefined)).toEqual({
      connected: 0,
      attention: null,
    });
    expect(
      connectionsLine([
        c("connected", "a"),
        c("error", "b"),
        c("connected", "c"),
      ])
    ).toEqual({ connected: 2, attention: "b" });
  });
  it("connections: up to three different connected apps, no IMAP, none that need attention", () => {
    const c = (
      kind: V3Connection["kind"],
      provider: string,
      state: V3Connection["state"] = "connected"
    ): V3Connection => ({
      provider,
      kind,
      state,
      label: provider,
      detail: null,
      accountId: null,
    });
    expect(connectionMarks(undefined)).toEqual([]);
    expect(
      connectionMarks([
        c("calendar", "google"),
        c("calendar", "google"),
        c("mail", "IMAP"),
        c("mail", "outlook", "error"),
        c("mail", "google"),
        c("integration", "notion"),
        c("integration", "slack"),
      ])
    ).toEqual(["gcal", "gmail", "notion"]);
  });
});
