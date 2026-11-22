import { pickPopup } from "../pick";
import type {
  PopupCandidate,
  PopupHistoryEntry,
  PopupSource,
  PopupUser,
  PopupView,
} from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const user = (over: Partial<PopupUser> = {}): PopupUser => ({
  id: "u1",
  plan: "FREE",
  signedUpAt: ago(30 * DAY),
  productUpdates: true,
  ...over,
});

function view(source: PopupSource, key: string): PopupView {
  return {
    id: key,
    source,
    key,
    kind: "update",
    badge: null,
    title: key,
    body: "",
    bullets: [],
    imageUrl: null,
    primary: null,
    secondary: null,
    cards: [],
    feature: null,
  };
}

const cand = (
  source: PopupSource,
  key: string,
  priority = 0
): PopupCandidate => ({ source, key, priority, view: view(source, key) });

const shown = (
  source: PopupSource,
  key: string,
  msAgo: number
): PopupHistoryEntry => ({ source, key, shownAt: ago(msAgo) });

describe("pickPopup", () => {
  it("returns nothing when there is nothing to show", () => {
    expect(pickPopup(user(), [], [], NOW)).toBeNull();
  });

  describe("frequency cap", () => {
    it("blocks an announcement within 3 days of any popup", () => {
      const history = [shown("feedback", "csat", 2 * DAY)];
      expect(
        pickPopup(user(), [cand("announcement", "a1")], history, NOW)
      ).toBeNull();
    });

    it("allows an announcement once 3 days have passed", () => {
      const history = [shown("feedback", "csat", 3 * DAY + 1000)];
      expect(
        pickPopup(user(), [cand("announcement", "a1")], history, NOW)?.key
      ).toBe("a1");
    });

    it("counts a limit popup against the cap for announcements", () => {
      const history = [shown("limit", "limit:habits", DAY)];
      expect(
        pickPopup(user(), [cand("announcement", "a1")], history, NOW)
      ).toBeNull();
    });

    it("lets a limit hit through the 3-day cap", () => {
      const history = [shown("announcement", "a0", DAY)];
      expect(
        pickPopup(user(), [cand("limit", "limit:habits")], history, NOW)?.key
      ).toBe("limit:habits");
    });

    it("shows the 1-day trial moment two days after the 3-day one", () => {
      const history = [shown("trial", "trial:3d", 2 * DAY)];
      expect(
        pickPopup(user(), [cand("trial", "trial:1d")], history, NOW)?.key
      ).toBe("trial:1d");
    });

    it("never shows the same trial moment twice", () => {
      const history = [shown("trial", "trial:3d", 10 * DAY)];
      expect(
        pickPopup(user(), [cand("trial", "trial:3d")], history, NOW)
      ).toBeNull();
    });
  });

  describe("limit moments", () => {
    it("appears at most once per limit per 7 days", () => {
      const history = [shown("limit", "limit:habits", 6 * DAY)];
      expect(
        pickPopup(user(), [cand("limit", "limit:habits")], history, NOW)
      ).toBeNull();
    });

    it("appears again after 7 days", () => {
      const history = [shown("limit", "limit:habits", 7 * DAY + 1000)];
      expect(
        pickPopup(user(), [cand("limit", "limit:habits")], history, NOW)?.key
      ).toBe("limit:habits");
    });

    it("tracks each limit on its own", () => {
      const history = [shown("limit", "limit:habits", 2 * DAY)];
      expect(
        pickPopup(user(), [cand("limit", "limit:boards")], history, NOW)?.key
      ).toBe("limit:boards");
    });
  });

  describe("priority", () => {
    it("limit-hit beats trial beats announcement", () => {
      const all = [
        cand("announcement", "a1", 99),
        cand("trial", "trial:1d"),
        cand("limit", "limit:habits"),
      ];
      expect(pickPopup(user(), all, [], NOW)?.source).toBe("limit");
      expect(pickPopup(user(), all.slice(0, 2), [], NOW)?.source).toBe(
        "trial"
      );
    });

    it("orders announcements by priority, higher first", () => {
      const all = [
        cand("announcement", "low", 1),
        cand("announcement", "high", 10),
      ];
      expect(pickPopup(user(), all, [], NOW)?.key).toBe("high");
    });

    it("puts the feedback prompt after announcements", () => {
      const all = [cand("feedback", "csat", 100), cand("announcement", "a1")];
      expect(pickPopup(user(), all, [], NOW)?.source).toBe("announcement");
    });
  });

  describe("suppression", () => {
    const candidates = [cand("limit", "limit:habits")];

    it.each([
      ["onboarding", { inOnboarding: true }],
      ["focus mode", { inFocus: true }],
      ["another dialog open", { dialogOpen: true }],
      ["a popup already shown this session", { shownThisSession: true }],
    ])("shows nothing during %s", (_name, ctx) => {
      expect(pickPopup(user(), candidates, [], NOW, ctx)).toBeNull();
    });

    it("also holds back a trial moment during focus", () => {
      expect(
        pickPopup(user(), [cand("trial", "trial:1d")], [], NOW, {
          inFocus: true,
        })
      ).toBeNull();
    });
  });

  describe("first days after signup", () => {
    const fresh = user({ signedUpAt: ago(DAY) });

    it("holds back announcements and limit popups", () => {
      expect(pickPopup(fresh, [cand("announcement", "a1")], [], NOW)).toBeNull();
      expect(pickPopup(fresh, [cand("limit", "limit:habits")], [], NOW)).toBeNull();
    });

    it("lets a trial-ending moment through", () => {
      expect(pickPopup(fresh, [cand("trial", "trial:1d")], [], NOW)?.key).toBe(
        "trial:1d"
      );
    });

    it("opens up on the third day", () => {
      const settled = user({ signedUpAt: ago(2 * DAY + 1000) });
      expect(
        pickPopup(settled, [cand("announcement", "a1")], [], NOW)?.key
      ).toBe("a1");
    });
  });

  describe("announcements", () => {
    it("never shows one that was shown before", () => {
      const history = [shown("announcement", "a1", 90 * DAY)];
      expect(
        pickPopup(user(), [cand("announcement", "a1")], history, NOW)
      ).toBeNull();
    });

    it("hides announcements, but not plan moments, when product updates are off", () => {
      const off = user({ productUpdates: false });
      expect(pickPopup(off, [cand("announcement", "a1")], [], NOW)).toBeNull();
      expect(pickPopup(off, [cand("limit", "limit:habits")], [], NOW)?.key).toBe(
        "limit:habits"
      );
      expect(pickPopup(off, [cand("trial", "trial:1d")], [], NOW)?.key).toBe(
        "trial:1d"
      );
    });
  });
});
