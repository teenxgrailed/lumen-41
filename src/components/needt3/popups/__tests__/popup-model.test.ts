import {
  MAX_TEXT,
  asksForReview,
  canSend,
  npsGroup,
  reviewRoute,
  scaleFor,
  stepAfterSend,
  toAnswer,
} from "../popup-model";

describe("canSend", () => {
  it("needs a pick on a scale and nothing else", () => {
    expect(canSend("rating", null, "great")).toBe(false);
    expect(canSend("rating", 4, "")).toBe(true);
    expect(canSend("nps", 0, "")).toBe(true);
    expect(canSend("nps", 11, "")).toBe(false);
    expect(canSend("rating", 0, "")).toBe(false);
  });

  it("needs a few words on an open question", () => {
    expect(canSend("wish", null, "  ")).toBe(false);
    expect(canSend("wish", null, "ab")).toBe(false);
    expect(canSend("friction", null, "sync is slow")).toBe(true);
    expect(canSend("wish", null, "x".repeat(MAX_TEXT + 1))).toBe(false);
  });
});

describe("toAnswer", () => {
  it("trims, drops empty text and ignores a score on an open question", () => {
    expect(toAnswer("rating", 5, "   ")).toEqual({ kind: "rating", score: 5 });
    expect(toAnswer("nps", 9, " fast ")).toEqual({
      kind: "nps",
      score: 9,
      text: "fast",
    });
    expect(toAnswer("wish", 3, " dark mode ")).toEqual({
      kind: "wish",
      text: "dark mode",
    });
  });
});

describe("the review step", () => {
  it("asks only a happy rating or a promoter", () => {
    expect(asksForReview({ kind: "rating", score: 4 })).toBe(true);
    expect(asksForReview({ kind: "rating", score: 3 })).toBe(false);
    expect(asksForReview({ kind: "nps", score: 9 })).toBe(true);
    expect(asksForReview({ kind: "nps", score: 8 })).toBe(false);
    expect(asksForReview({ kind: "wish", text: "more" })).toBe(false);
  });

  it("is the native request in the shell and Product Hunt on the web", () => {
    expect(reviewRoute({ nativeRequest: true })).toEqual({ kind: "native" });
    expect(
      reviewRoute({
        nativeRequest: false,
        productHuntUrl: "https://www.producthunt.com/products/needt",
      })
    ).toMatchObject({ kind: "link" });
    expect(reviewRoute({ nativeRequest: false })).toBeNull();
    expect(
      reviewRoute({ nativeRequest: false, productHuntUrl: "javascript:1" })
    ).toBeNull();
  });

  it("goes to thanks when there is nowhere to send a review", () => {
    const happy = { kind: "rating", score: 5 } as const;
    expect(stepAfterSend(happy, { kind: "native" })).toBe("review");
    expect(stepAfterSend(happy, null)).toBe("thanks");
    expect(
      stepAfterSend({ kind: "rating", score: 2 }, { kind: "native" })
    ).toBe("thanks");
  });
});

describe("scales", () => {
  it("are 1-5 and 0-10, and NPS groups follow the standard cut", () => {
    expect(scaleFor("rating")).toHaveLength(5);
    expect(scaleFor("nps")).toHaveLength(11);
    expect(scaleFor("wish")).toHaveLength(0);
    expect([0, 6, 7, 8, 9, 10].map(npsGroup)).toEqual([
      "detractor",
      "detractor",
      "passive",
      "passive",
      "promoter",
      "promoter",
    ]);
  });
});
