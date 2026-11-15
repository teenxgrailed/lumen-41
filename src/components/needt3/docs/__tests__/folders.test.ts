import type { V3Doc } from "@/lib/needt3/map";

import {
  UNSORTED,
  folderModel,
  groupDocs,
  hasFolders,
  openGroup,
  updatedCaption,
} from "../folders";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");

const doc = (id: string, over: Partial<V3Doc> = {}): V3Doc => ({
  id,
  title: id,
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
  ...over,
});

const projects = [
  { id: "ops", name: "Operations", color: "#d80" },
  { id: "home", name: "Home", color: null },
];

describe("groupDocs", () => {
  it("groups by project, newest page first, folders newest-changed first, Unsorted last", () => {
    const g = groupDocs(
      [
        doc("a", { projectId: "home", updatedAt: "2026-11-01T10:00:00.000Z" }),
        doc("b", { projectId: "ops", updatedAt: "2026-11-10T10:00:00.000Z" }),
        doc("c", { projectId: "ops", updatedAt: "2026-11-12T10:00:00.000Z" }),
        doc("loose", { updatedAt: "2026-11-14T10:00:00.000Z" }),
      ],
      projects
    );
    expect(g.map((x) => x.key)).toEqual(["ops", "home", UNSORTED]);
    expect(g[0].docs.map((d) => d.id)).toEqual(["c", "b"]);
    expect(g[0]).toMatchObject({ label: "Operations", color: "#d80" });
    expect(g[2]).toMatchObject({ label: "Unsorted", color: null });
  });

  it("puts pages whose project is gone into Unsorted and omits empty projects", () => {
    const g = groupDocs(
      [doc("a", { projectId: "deleted" }), doc("b", { projectId: "ops" })],
      projects
    );
    expect(g.map((x) => x.key)).toEqual(["ops", UNSORTED]);
    expect(g[1].docs.map((d) => d.id)).toEqual(["a"]);
  });

  it("is empty without pages", () => {
    expect(groupDocs([], projects)).toEqual([]);
  });
});

describe("folderModel", () => {
  const many = groupDocs(
    ["1", "2", "3", "4"].map((n, i) =>
      doc(n, {
        projectId: "ops",
        title: n === "3" ? "" : `Page ${n}`,
        updatedAt: `2026-11-0${i + 1}T10:00:00.000Z`,
      })
    ),
    projects
  )[0];

  it("peeks the three most recently updated pages, counts all of them", () => {
    const m = folderModel(many, NOW);
    expect(m.count).toBe(4);
    expect(m.peeks.map((p) => p.key)).toEqual(["4", "3", "2"]);
    expect(m.peeks[1].title).toBe("Untitled");
    expect(m.hue).toBe("#d80");
  });

  it("captions with the newest page's age", () => {
    expect(folderModel(many, NOW).caption).toBe("Updated 4 Nov");
    const fresh = groupDocs(
      [doc("a", { updatedAt: "2026-11-15T11:59:30.000Z" })],
      projects
    )[0];
    expect(folderModel(fresh, NOW).caption).toBe("Updated just now");
  });
});

describe("updatedCaption", () => {
  it("lowercases only the words, never a month, and has none without a stamp", () => {
    expect(updatedCaption("2026-11-14T10:00:00.000Z", NOW)).toBe(
      "Updated yesterday"
    );
    expect(updatedCaption("2026-11-15T11:30:00.000Z", NOW)).toBe(
      "Updated 30 min ago"
    );
    expect(updatedCaption(null, NOW)).toBeUndefined();
  });
});

describe("the top level", () => {
  const two = groupDocs([doc("a", { projectId: "ops" }), doc("b")], projects);
  it("is folders from two groups on, the list itself for one", () => {
    expect(hasFolders(two)).toBe(true);
    expect(hasFolders(two.slice(0, 1))).toBe(false);
    expect(hasFolders([])).toBe(false);
  });
  it("finds the open group and falls back to the top when it is gone", () => {
    expect(openGroup(two, "ops")?.key).toBe("ops");
    expect(openGroup(two, "gone")).toBeNull();
    expect(openGroup(two, null)).toBeNull();
  });
});
