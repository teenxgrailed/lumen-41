import { ctxHeight, ctxMenuFor, openSub, registerCtx } from "../registry";

const el = (attrs: Record<string, string>) =>
  ({
    getAttribute: (k: string) => attrs[k] ?? null,
  }) as unknown as HTMLElement;

describe("context menu registry", () => {
  it("resolves a marked kind and falls back to the app menu", () => {
    const offApp = registerCtx("app", () => [[{ label: "Search" }]]);
    const offPlace = registerCtx("place", ({ id }) =>
      id === "mail" ? [[{ label: `Open ${id}` }]] : null
    );
    expect(
      ctxMenuFor(el({ "data-ctx": "place", "data-ctx-id": "mail" }))
    ).toEqual([[{ label: "Open mail" }]]);
    expect(ctxMenuFor(el({ "data-ctx": "place", "data-ctx-id": "x" }))).toEqual(
      [[{ label: "Search" }]]
    );
    expect(ctxMenuFor(el({ "data-ctx": "unknown" }))).toEqual([
      [{ label: "Search" }],
    ]);
    expect(ctxMenuFor(null)).toEqual([[{ label: "Search" }]]);
    offPlace();
    offApp();
    expect(ctxMenuFor(null)).toBeNull();
  });

  it("unregistering an old resolver leaves a newer one in place", () => {
    const a = registerCtx("doc", () => [[{ label: "A" }]]);
    const b = registerCtx("doc", () => [[{ label: "B" }]]);
    a();
    expect(ctxMenuFor(el({ "data-ctx": "doc" }))).toEqual([[{ label: "B" }]]);
    b();
  });

  it("a submenu replaces the menu under its title", () => {
    const sub = openSub({
      label: "Move to…",
      hint: "›",
      sub: [{ label: "Ops" }, { label: "No project" }],
    });
    expect(sub[0]).toEqual([{ label: "Move to", tone: "title" }]);
    expect(sub[1]).toHaveLength(2);
    expect(ctxHeight(sub)).toBe(36 + 72 + 11 + 12);
  });
});
