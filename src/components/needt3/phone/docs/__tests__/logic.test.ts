import type { V3Doc } from "@/lib/needt3/map";

import {
  BG_LIST,
  EDGE,
  bgChoice,
  bgKind,
  cardMeta,
  coverKind,
  docsSub,
  edgeIntent,
  edgeProgress,
  edgeRelease,
  keyboardLift,
  matchDocs,
  needsPro,
  planIsPro,
  pullHits,
  scrollVars,
  sortLine,
  startsAtEdge,
} from "../logic";

const doc = (over: Partial<V3Doc> = {}): V3Doc => ({
  id: "d1",
  title: "Plan",
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-10T10:00:00.000Z",
  ...over,
});

describe("sort line", () => {
  it("says what the list is ordered by", () => {
    expect(sortLine({ key: "name", dir: "asc" })).toBe("By name");
    expect(sortLine({ key: "name", dir: "desc" })).toBe("By name, Z to A");
    expect(sortLine({ key: "viewed", dir: "desc" })).toBe("Recently viewed");
    expect(sortLine({ key: "created", dir: "desc" })).toBe("Recently created");
    expect(sortLine({ key: "updated", dir: "desc" })).toBe("Recently edited");
  });
  it("names the label and the reversed order for an oldest-first date sort", () => {
    expect(sortLine({ key: "updated", dir: "asc" })).toBe(
      "Date updated, oldest first"
    );
    expect(sortLine({ key: "viewed", dir: "asc" })).toBe(
      "Last viewed, oldest first"
    );
  });
  it("the sub line counts the documents and shows nothing for none", () => {
    const s = { key: "updated", dir: "desc" } as const;
    expect(docsSub(0, s)).toBeNull();
    expect(docsSub(1, s)).toBe("1 document · Recently edited");
    expect(docsSub(3, s)).toBe("3 documents · Recently edited");
  });
});

describe("Quick Open and the pull-down", () => {
  const docs = [
    doc({ id: "a", title: "Trip to Lisbon" }),
    doc({ id: "b", title: "" }),
    doc({ id: "c", title: "Budget" }),
  ];
  it("keeps everything for an empty or blank query", () => {
    expect(matchDocs(docs, "")).toHaveLength(3);
    expect(matchDocs(docs, "   ")).toHaveLength(3);
  });
  it("matches words in the title, case-blind", () => {
    expect(matchDocs(docs, "LISB").map((d) => d.id)).toEqual(["a"]);
    expect(matchDocs(docs, "zzz")).toEqual([]);
  });
  it("an untitled doc is found as Untitled", () => {
    expect(matchDocs(docs, "untitled").map((d) => d.id)).toEqual(["b"]);
  });
  it("the pull-down returns at most five hits with their age", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      doc({ id: `x${i}`, title: `Note ${i}` })
    );
    const now = Date.parse("2026-10-10T10:20:00.000Z");
    const hits = pullHits(many, "note", now);
    expect(hits).toHaveLength(5);
    expect(hits[0]).toEqual({
      id: "x0",
      title: "Note 0",
      meta: "20 min ago",
    });
    expect(pullHits([doc({ title: "" })], "", now)[0].title).toBe("Untitled");
  });
  it("a card's meta carries the project and the age", () => {
    const now = Date.parse("2026-10-10T10:20:00.000Z");
    expect(cardMeta(doc(), { name: "Home", color: null }, now)).toEqual({
      project: { name: "Home", color: null },
      age: "20 min ago",
    });
    expect(cardMeta(doc({ updatedAt: null }), null, now).age).toBe("");
  });
});

describe("Page Style: Background", () => {
  it("reads the kind from the style", () => {
    expect(bgKind({ backdrop: "none", page: "white" })).toBe("none");
    expect(bgKind({ backdrop: "none", page: "paper" })).toBe("solid");
    expect(bgKind({ backdrop: "mist", page: "white" })).toBe("gradient");
    expect(bgKind({ backdrop: "sparkle", page: "paper" })).toBe("gradient");
    expect(bgKind({ backdrop: "dunes", page: "white" })).toBe("image");
    expect(bgKind({ backdrop: "unknown", page: "white" })).toBe("image");
  });
  it("None clears the backdrop and the page colour", () => {
    expect(bgChoice("none", { backdrop: "ocean", page: "sky" })).toEqual({
      patch: { backdrop: "none", page: "white" },
      pickColour: false,
    });
  });
  it("Solid drops the backdrop and asks for the page colour", () => {
    expect(bgChoice("solid", { backdrop: "ocean", page: "sky" })).toEqual({
      patch: { backdrop: "none" },
      pickColour: true,
    });
  });
  it("Gradient and Image keep a backdrop of that kind, else take the first", () => {
    expect(bgChoice("image", { backdrop: "ocean", page: "w" }).patch).toEqual({
      backdrop: "ocean",
    });
    expect(bgChoice("image", { backdrop: "mist", page: "w" }).patch).toEqual({
      backdrop: BG_LIST.image[0],
    });
    expect(bgChoice("gradient", { backdrop: "none", page: "w" }).patch).toEqual(
      { backdrop: BG_LIST.gradient[0] }
    );
  });
  it("the cover is a picture or nothing", () => {
    expect(coverKind(null)).toBe("none");
    expect(coverKind("https://x/y.jpg")).toBe("image");
  });
});

describe("Page Style: the Pro gate", () => {
  it("a backdrop on a page without one needs Pro", () => {
    expect(needsPro(doc(), { backdrop: "mist" })).toBe(true);
  });
  it("fonts, text colour, look, blur and three page colours are free", () => {
    expect(needsPro(doc(), { font: "serif" })).toBe(false);
    expect(needsPro(doc(), { font: "mono" })).toBe(false);
    expect(needsPro(doc(), { font: "rounded" })).toBe(false);
    expect(needsPro(doc(), { text: "umber" })).toBe(false);
    for (const page of ["white", "paper", "graphite"]) {
      expect(needsPro(doc(), { page })).toBe(false);
    }
  });
  it("the other page colours and any cover need Pro", () => {
    for (const page of ["rose", "lilac", "sage", "sky", "sand", "black"]) {
      expect(needsPro(doc(), { page })).toBe(true);
    }
    expect(needsPro(doc(), { cover: "https://x/y.jpg" })).toBe(true);
    expect(needsPro(doc(), { cover: "art:rose" })).toBe(true);
  });
  it("removing a cover, or keeping the one a page has, is free", () => {
    const d = doc({ coverUrl: "art:rose" });
    expect(needsPro(d, { cover: null })).toBe(false);
    expect(needsPro(d, { font: "serif" })).toBe(false);
    expect(needsPro(d, { cover: "art:rose" })).toBe(false);
    expect(needsPro(d, { cover: "art:sand" })).toBe(true);
  });
  it("keeping the backdrop a page already has is not a change", () => {
    const d = doc({ style: { backdrop: "dunes", page: "white" } });
    expect(needsPro(d, { font: "mono" })).toBe(false);
    expect(needsPro(d, { bdBlur: true })).toBe(false);
    expect(needsPro(d, { backdrop: "dunes" })).toBe(false);
  });
  it("going to a different backdrop does; going back to None does not", () => {
    const d = doc({ style: { backdrop: "dunes", page: "white" } });
    expect(needsPro(d, { backdrop: "ocean" })).toBe(true);
    expect(needsPro(d, { backdrop: "none" })).toBe(false);
  });
  it("an older page whose theme resolves to a backdrop counts the same", () => {
    const d = doc({ style: { theme: "ocean" } });
    expect(needsPro(d, { font: "mono" })).toBe(false);
    expect(needsPro(d, { backdrop: "mist" })).toBe(true);
  });
  it("an unknown plan is not Pro", () => {
    expect(planIsPro(undefined)).toBe(false);
    expect(planIsPro(null)).toBe(false);
    expect(planIsPro("free")).toBe(false);
    expect(planIsPro("trial")).toBe(true);
    expect(planIsPro("monthly")).toBe(true);
  });
});

describe("edge swipe", () => {
  it("starts only in the left strip", () => {
    expect(startsAtEdge(0, 0)).toBe(true);
    expect(startsAtEdge(EDGE, 0)).toBe(true);
    expect(startsAtEdge(EDGE + 1, 0)).toBe(false);
    expect(startsAtEdge(30, 10)).toBe(true);
    expect(startsAtEdge(5, 10)).toBe(false);
  });
  it("tells a rightward swipe from a scroll, after a little travel", () => {
    expect(edgeIntent(2, 2)).toBeNull();
    expect(edgeIntent(14, 3)).toBe("back");
    expect(edgeIntent(3, 14)).toBe("none");
    expect(edgeIntent(-14, 2)).toBe("none");
  });
  it("follows the finger 1:1 as a share of the width", () => {
    expect(edgeProgress(100, 400)).toBeCloseTo(0.25);
    expect(edgeProgress(-20, 400)).toBe(0);
    expect(edgeProgress(900, 400)).toBe(1);
    expect(edgeProgress(10, 0)).toBe(0);
  });
  it("goes back past 40% or on a flick, never on a cancel", () => {
    expect(edgeRelease("up", 0.5, 0)).toBe("back");
    expect(edgeRelease("up", 0.4, 0)).toBe("stay");
    expect(edgeRelease("up", 0.1, 0.5)).toBe("back");
    expect(edgeRelease("up", 0.03, 0.9)).toBe("stay");
    expect(edgeRelease("up", 0.2, 0.2)).toBe("stay");
    expect(edgeRelease("cancel", 0.9, 2)).toBe("stay");
  });
});

describe("reader scroll", () => {
  it("the fog follows the offset", () => {
    expect(scrollVars(0, 2000, 800)).toEqual({ fog: 1 });
    expect(scrollVars(1200, 2000, 800).fog).toBe(0);
  });
  it("short content has no fog", () => {
    expect(scrollVars(0, 700, 800).fog).toBe(0);
  });
  it("the keyboard lift is what the visual viewport lost, never negative", () => {
    expect(keyboardLift(844, 544, 0)).toBe(300);
    expect(keyboardLift(844, 544, 40)).toBe(260);
    expect(keyboardLift(844, 844, 0)).toBe(0);
    expect(keyboardLift(800, 844, 0)).toBe(0);
  });
});
