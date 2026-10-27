import type { MenuPlaceId } from "../../menu/places";
import { dockSlot, pageMotionFor, placeKeyOf } from "../pageMotion";

const DEFAULT: MenuPlaceId[] = ["home", "docs", "ask"];

describe("placeKeyOf", () => {
  it("is the first path segment, without query or hash", () => {
    expect(placeKeyOf("/today")).toBe("today");
    expect(placeKeyOf("/tasks/abc?x=1#top")).toBe("tasks");
    expect(placeKeyOf("/")).toBe("");
    expect(placeKeyOf("")).toBe("");
  });
});

describe("dockSlot", () => {
  it("is the tile's index, and one past the tiles for any other place", () => {
    expect(dockSlot("home", DEFAULT)).toBe(0);
    expect(dockSlot("docs", DEFAULT)).toBe(1);
    expect(dockSlot("ask", DEFAULT)).toBe(2);
    expect(dockSlot("calendar", DEFAULT)).toBe(3);
    expect(dockSlot(null, DEFAULT)).toBe(3);
  });
});

describe("pageMotionFor", () => {
  it("goes toward the side of the dock the new tile is on", () => {
    expect(pageMotionFor("home", "docs", DEFAULT)).toBe("forward");
    expect(pageMotionFor("docs", "home", DEFAULT)).toBe("back");
    expect(pageMotionFor("home", "ask", DEFAULT)).toBe("forward");
    expect(pageMotionFor("ask", "home", DEFAULT)).toBe("back");
  });

  it("follows a saved order of tiles, not the default", () => {
    const tiles: MenuPlaceId[] = ["calendar", "tasks", "home"];
    expect(pageMotionFor("calendar", "tasks", tiles)).toBe("forward");
    expect(pageMotionFor("home", "calendar", tiles)).toBe("back");
    expect(pageMotionFor("tasks", "home", tiles)).toBe("forward");
    // docs is no longer a tile: it rises from the dock
    expect(pageMotionFor("home", "docs", tiles)).toBe("rise");
  });

  it("a place from the menu card rises from the dock, from anywhere", () => {
    expect(pageMotionFor("home", "calendar", DEFAULT)).toBe("rise");
    expect(pageMotionFor("docs", "mail", DEFAULT)).toBe("rise");
    expect(pageMotionFor("calendar", "mail", DEFAULT)).toBe("rise");
    expect(pageMotionFor("home", null, DEFAULT)).toBe("rise");
  });

  it("leaving a menu place for a tile goes back toward the tiles", () => {
    expect(pageMotionFor("calendar", "home", DEFAULT)).toBe("back");
    expect(pageMotionFor("mail", "docs", DEFAULT)).toBe("back");
    expect(pageMotionFor(null, "ask", DEFAULT)).toBe("back");
  });

  it("the same place does not move", () => {
    expect(pageMotionFor("docs", "docs", DEFAULT)).toBeNull();
    expect(pageMotionFor(null, null, DEFAULT)).toBeNull();
  });
});
