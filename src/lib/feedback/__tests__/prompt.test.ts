import {
  canSend,
  markPromptedThisSession,
  markSkippedToday,
  promptedThisSession,
  resetPromptedMemory,
  reviewChannel,
  skippedToday,
} from "../prompt";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => resetPromptedMemory());

describe("once per session", () => {
  it("is false until a prompt was shown, then true for the whole session", () => {
    const store = memoryStore();
    expect(promptedThisSession(store)).toBe(false);
    markPromptedThisSession(store);
    expect(promptedThisSession(store)).toBe(true);
  });

  it("survives a reload through the storage", () => {
    const store = memoryStore();
    markPromptedThisSession(store);
    resetPromptedMemory(); // a fresh page load: only the storage remembers
    expect(promptedThisSession(store)).toBe(true);
  });

  it("still holds when the storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(promptedThisSession(broken)).toBe(false);
    markPromptedThisSession(broken);
    expect(promptedThisSession(broken)).toBe(true);
  });

  it("works with no storage at all", () => {
    expect(promptedThisSession(null)).toBe(false);
    markPromptedThisSession(null);
    expect(promptedThisSession(null)).toBe(true);
  });
});

describe("reviewChannel", () => {
  const url = "https://www.producthunt.com/products/example";

  it("uses the system prompt in an iOS build that has the bridge", () => {
    expect(
      reviewChannel({ platform: "ios", nativeReviewAvailable: true })
    ).toEqual({ kind: "native" });
  });

  it("hides the step in an older iOS build without the bridge", () => {
    expect(
      reviewChannel({
        platform: "ios",
        nativeReviewAvailable: false,
        productHuntUrl: url,
      })
    ).toBeNull();
  });

  it("links the web and the Windows app to Product Hunt when a URL is set", () => {
    for (const platform of ["web", "desktop"] as const)
      expect(
        reviewChannel({
          platform,
          nativeReviewAvailable: false,
          productHuntUrl: url,
        })
      ).toEqual({ kind: "link", url });
  });

  it("hides the step on the web while no Product Hunt URL exists", () => {
    expect(
      reviewChannel({
        platform: "web",
        nativeReviewAvailable: false,
        productHuntUrl: null,
      })
    ).toBeNull();
    // the shipped default is the todo: no URL yet
    expect(
      reviewChannel({ platform: "web", nativeReviewAvailable: false })
    ).toBeNull();
  });

  it("hides the step in the Mac app, which has no review bridge", () => {
    expect(
      reviewChannel({
        platform: "mac",
        nativeReviewAvailable: false,
        productHuntUrl: url,
      })
    ).toBeNull();
  });
});

describe("canSend", () => {
  const blank = { rating: null, score: null, text: "" };
  it("needs a rating, a score, or text, by kind", () => {
    expect(canSend("rating", blank)).toBe(false);
    expect(canSend("rating", { ...blank, rating: 3 })).toBe(true);
    expect(canSend("nps", blank)).toBe(false);
    expect(canSend("nps", { ...blank, score: 0 })).toBe(true);
    expect(canSend("idea", blank)).toBe(false);
    expect(canSend("idea", { ...blank, text: "   " })).toBe(false);
    expect(canSend("annoyance", { ...blank, text: "sync" })).toBe(true);
  });
});

describe("not eligible today", () => {
  it("is remembered for the UTC day and forgotten the next", () => {
    const store = memoryStore();
    const noon = new Date("2026-11-22T12:00:00Z");
    expect(skippedToday(store, noon)).toBe(false);
    markSkippedToday(store, noon);
    expect(skippedToday(store, new Date("2026-11-22T23:59:00Z"))).toBe(true);
    expect(skippedToday(store, new Date("2026-11-23T00:01:00Z"))).toBe(false);
    expect(skippedToday(null, noon)).toBe(false);
  });
});
