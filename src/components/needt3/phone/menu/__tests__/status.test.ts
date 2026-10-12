import { MENU_ORDER, menuSub } from "../places";
import { type MenuCounts, menuBadge, menuStatus } from "../status";

describe("menuStatus", () => {
  it("before anything has loaded, every row says what its place is for", () => {
    for (const id of MENU_ORDER)
      expect(menuStatus(id, {})).toEqual({ text: menuSub(id) });
    expect(menuStatus("home")).toEqual({ text: "Your day as a page" });
  });

  it("Home: overdue is an alert, otherwise what is left today", () => {
    expect(menuStatus("home", { overdue: 3, today: 4 })).toEqual({
      text: "3 overdue · 4 left today",
      alert: true,
    });
    expect(menuStatus("home", { overdue: 2 })).toEqual({
      text: "2 overdue · 0 left today",
      alert: true,
    });
    expect(menuStatus("home", { overdue: 0, today: 0 })).toEqual({
      text: "0 left today",
    });
  });

  it("Calendar: the next event, or nothing else today", () => {
    expect(
      menuStatus("calendar", {
        nextEvent: { title: "Design review", at: "14:00", inMin: 42 },
      })
    ).toEqual({ text: "Next · Design review at 14:00" });
    expect(menuStatus("calendar", { nextEvent: null })).toEqual({
      text: "Nothing else today",
    });
  });

  it("Tasks: open, and how many are not placed", () => {
    expect(menuStatus("tasks", { open: 12 })).toEqual({ text: "12 open" });
    expect(menuStatus("tasks", { open: 12, unplaced: 3 })).toEqual({
      text: "12 open · 3 not placed",
    });
  });

  it("Docs: pages and when the latest was edited", () => {
    expect(menuStatus("docs", { docs: 9, docsEdited: "5 min ago" })).toEqual({
      text: "9 pages · edited 5 min ago",
    });
    expect(menuStatus("docs", { docs: 1, docsEdited: null })).toEqual({
      text: "1 page · edited today",
    });
    expect(menuStatus("docs", { docs: 0 })).toEqual({ text: "No pages yet" });
  });

  it("Mail: unread, all read, or an account that needs you (an alert)", () => {
    expect(menuStatus("mail", { mail: 2 })).toEqual({ text: "2 unread" });
    expect(menuStatus("mail", { mail: 0 })).toEqual({ text: "All read" });
    expect(menuStatus("mail", { mail: 2, mailDown: ["Outlook"] })).toEqual({
      text: "2 unread · Outlook needs you",
      alert: true,
    });
    expect(menuStatus("mail", { mail: 0, mailDown: ["A", "B"] })).toEqual({
      text: "A, B need you",
      alert: true,
    });
  });

  it("Habits, Boards, Projects", () => {
    expect(menuStatus("habits", { habits: 4, habitsDone: 2 })).toEqual({
      text: "2 of 4 kept today",
    });
    expect(menuStatus("habits", { habits: 0 })).toEqual({
      text: "No habits yet",
    });
    expect(menuStatus("moodboards", { boards: 5 })).toEqual({
      text: "5 boards",
    });
    expect(menuStatus("moodboards", { boards: 1 })).toEqual({
      text: "1 board",
    });
    expect(menuStatus("projects", { projects: 6 })).toEqual({
      text: "6 projects",
    });
  });

  it("Connections: what needs reconnecting, else how many are connected", () => {
    expect(menuStatus("connections", { connectionsDown: ["Outlook"] })).toEqual(
      {
        text: "Outlook needs reconnecting",
        alert: true,
      }
    );
    expect(menuStatus("connections", { connected: 3 })).toEqual({
      text: "3 connected",
    });
    expect(menuStatus("connections", { connected: 0 })).toEqual({
      text: "Nothing connected yet",
    });
  });

  it("static rows keep their line", () => {
    expect(menuStatus("trash", { overdue: 9 }).text).toBe("Kept for 30 days");
    expect(menuStatus("settings").text).toBe("Theme, hours, notifications");
  });
});

describe("menuBadge", () => {
  const c: MenuCounts = {
    mail: 4,
    overdue: 2,
    nextEvent: { title: "x", at: "10:00", inMin: 30 },
  };

  it("the small mark on a top tile", () => {
    expect(menuBadge("mail", c)).toEqual({ text: "4" });
    expect(menuBadge("home", c)).toEqual({ text: "2", alert: true });
    expect(menuBadge("tasks", c)).toEqual({ text: "2", alert: true });
    expect(menuBadge("calendar", c)).toEqual({ text: "30m" });
  });

  it("no mark when there is nothing to say", () => {
    expect(menuBadge("mail", { mail: 0 })).toBeNull();
    expect(menuBadge("home", { overdue: 0 })).toBeNull();
    expect(
      menuBadge("calendar", {
        nextEvent: { title: "x", at: "18:00", inMin: 300 },
      })
    ).toBeNull();
    expect(menuBadge("calendar", { nextEvent: null })).toBeNull();
    expect(menuBadge("docs", c)).toBeNull();
    expect(menuBadge("ask", c)).toBeNull();
  });
});
