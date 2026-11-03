import {
  MENU_ORDER,
  menuAction,
  menuIdForPath,
  menuRows,
  menuWord,
} from "../../phone/menu/places";
import { menuStatus } from "../../phone/menu/status";
import { AGENTS_HREF, agentsNavItem, isAgentsPath } from "../agents-nav";
import { PLACES } from "../places";

describe("the Agents item in the desktop sidebar", () => {
  it("does not exist without the agent hub", () => {
    expect(agentsNavItem({ enabled: false, unread: 0 })).toBeNull();
    // A stale count never brings it back.
    expect(agentsNavItem({ enabled: false, unread: 4 })).toBeNull();
  });

  it("shows with the hub, with no badge until something waits", () => {
    expect(agentsNavItem({ enabled: true, unread: 0 })).toMatchObject({
      href: "/agents",
      label: "Agents",
      badge: null,
    });
  });

  it("counts the unread alerts and caps the badge", () => {
    expect(agentsNavItem({ enabled: true, unread: 1 })).toMatchObject({
      badge: "1",
      title: "1 agent needs you",
    });
    expect(agentsNavItem({ enabled: true, unread: 3 })?.title).toBe(
      "3 agents need you"
    );
    expect(agentsNavItem({ enabled: true, unread: 12 })?.badge).toBe("9+");
    expect(agentsNavItem({ enabled: true, unread: -2 })?.badge).toBeNull();
  });

  it("is not one of the customisable places, so it has no tile to hide", () => {
    expect(PLACES.map((place) => place.href)).not.toContain(AGENTS_HREF);
  });

  it("knows its own path", () => {
    expect(isAgentsPath("/agents")).toBe(true);
    expect(isAgentsPath("/agents/anything")).toBe(true);
    expect(isAgentsPath("/agentsmith")).toBe(false);
  });
});

describe("the Agents row in the phone menu", () => {
  const top = ["home", "docs", "ask"] as const;

  it("is not a row without the hub, and the card is what it was", () => {
    expect(menuRows(top)).not.toContain("agents");
    expect(menuRows(top, { agents: false })).not.toContain("agents");
    expect(menuRows(top)).toEqual(
      MENU_ORDER.filter((id) => id !== "agents" && !top.includes(id as never))
    );
  });

  it("is a row with the hub, after Connections", () => {
    const rows = menuRows(top, { agents: true });
    expect(rows).toContain("agents");
    expect(rows.indexOf("agents")).toBe(rows.indexOf("connections") + 1);
  });

  it("opens /agents and is the place for that path", () => {
    expect(menuAction("agents")).toEqual({ kind: "route", href: "/agents" });
    expect(menuIdForPath("/agents")).toBe("agents");
    expect(menuWord("agents")).toBe("Agents");
  });

  it("says what waits, in red, only when something does", () => {
    expect(menuStatus("agents", { agents: { unread: 2 } })).toEqual({
      text: "2 agents need you",
      alert: true,
    });
    expect(menuStatus("agents", { agents: { unread: 1 } }).text).toBe(
      "1 agent needs you"
    );
    expect(menuStatus("agents", { agents: { unread: 0 } }).alert).toBeFalsy();
  });
});
