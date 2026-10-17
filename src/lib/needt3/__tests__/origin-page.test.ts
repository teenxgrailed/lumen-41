import {
  DOC_ORIGIN,
  expandOriginPage,
  originPageIdOf,
  withOriginPageId,
} from "../origin-page";

describe("originPageIdOf", () => {
  it("is the id only for a doc origin", () => {
    expect(originPageIdOf({ originKind: "doc", originId: "p1" })).toBe("p1");
    expect(originPageIdOf({ originKind: "mail", originId: "m1" })).toBeNull();
    expect(originPageIdOf({ originKind: "doc", originId: null })).toBeNull();
    expect(originPageIdOf({})).toBeNull();
  });
});

describe("withOriginPageId", () => {
  it("adds the field and keeps the row", () => {
    expect(
      withOriginPageId({ id: "t", originKind: "doc", originId: "p" })
    ).toEqual({ id: "t", originKind: "doc", originId: "p", originPageId: "p" });
  });
});

describe("expandOriginPage", () => {
  it("a page id becomes the doc columns and is removed", () => {
    expect(
      expandOriginPage({ originPageId: "p1", splitAllowed: true })
    ).toEqual({ originKind: DOC_ORIGIN, originId: "p1", splitAllowed: true });
  });

  it("null clears both columns", () => {
    expect(expandOriginPage({ originPageId: null })).toEqual({
      originKind: null,
      originId: null,
    });
  });

  it("absent leaves the body alone", () => {
    expect(expandOriginPage({ splitAllowed: false })).toEqual({
      splitAllowed: false,
    });
  });

  it("explicit columns win over the shorthand", () => {
    expect(
      expandOriginPage({
        originPageId: "p1",
        originKind: "chat",
        originId: "c1",
      })
    ).toEqual({ originKind: "chat", originId: "c1" });
  });
});
