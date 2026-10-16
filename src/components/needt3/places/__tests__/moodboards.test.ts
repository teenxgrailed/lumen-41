/**
 * The Moodboards desktop grid (places.jsx `MoodboardsScreen`): each card's
 * cover is a collage of the board's first references, the grey glyph only for
 * an empty board; Free sees the limit line and the one upsell, Pro neither.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import { usePaywallStore } from "@/components/needt3/paywall/store";

import type { V3Board } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { MoodboardsScreen, notifyBoardsBlocked } from "../MoodboardsScreen";
import { FREE_BOARDS } from "../derive";
import type { BoardsController } from "../useBoardsController";

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => false }));
let planKind = "free";
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: planKind } }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: { prefs: {} } }),
  useSetPref: () => jest.fn(),
}));
let boards: V3Board[] = [];
jest.mock("@/lib/needt3/hooks/boards", () => ({
  useBoards: () => ({
    status: "success",
    fetchStatus: "idle",
    data: boards,
    error: null,
    refetch: jest.fn(),
  }),
}));

const board = (id: string, title: string, extra: Partial<V3Board> = {}) =>
  ({
    id,
    title,
    createdAt: "2026-09-01T00:00:00.000Z",
    projectId: null,
    linkShare: false,
    pinterestBoardId: null,
    pinterestStatus: null,
    pinterestSyncedAt: null,
    trashedAt: null,
    itemCount: 0,
    preview: [],
    ...extra,
  }) as V3Board;

const tile = (id: string, color: string) => ({
  id,
  kind: "color" as const,
  url: null,
  color,
  text: null,
  thumbnailUrl: null,
});

const render = () =>
  renderToStaticMarkup(
    h(MoodboardsScreen, {
      ctl: {
        open: jest.fn(),
        make: jest.fn(),
        remove: jest.fn(),
      } as unknown as BoardsController,
    })
  );

describe("Moodboards grid", () => {
  beforeEach(() => {
    planKind = "free";
    boards = [
      board("a", "SS27 drop", {
        itemCount: 8,
        preview: [
          tile("1", "#111111"),
          tile("2", "#c8dcf5"),
          tile("3", "#8a8178"),
        ],
      }),
      board("b", "Shop look"),
      board("c", "Gone", { trashedAt: "2026-09-02T00:00:00.000Z" }),
    ];
  });

  it("covers a board with its first references as a collage and counts them", () => {
    const out = render();
    expect(out).toContain('data-pl-collage="3"');
    expect(out).toContain("pl-collage-el is-tall");
    expect(out).toContain("8 references");
    expect(out).toContain("pl-mb-grid-3");
  });

  it("keeps the grey glyph for the empty board only", () => {
    const out = render();
    expect(out).toContain('data-pl-collage="0"');
    expect(out.match(/pl-collage-grid-2/g)).toHaveLength(1);
    expect(out).toContain("0 references");
  });

  it("does not list a trashed board", () => {
    expect(render()).not.toContain("Gone");
  });

  it('Free reads "N boards · Free includes 1" and carries the one upsell', () => {
    boards = boards.filter((b) => !b.trashedAt);
    const out = render();
    expect(out).toContain(`2 boards · Free includes ${FREE_BOARDS}`);
    expect(out).toContain("Upgrade for more");
    expect(out).toContain('data-pro-upsell="moodboards"');
    expect(out).toContain("Unlimited moodboards");
  });

  it("Pro reads the count and has no limit line or upsell", () => {
    planKind = "yearly";
    const out = render();
    expect(out).toContain("2 boards");
    expect(out).not.toContain("Free includes");
    expect(out).not.toContain("data-pro-upsell");
  });
});

describe("the Free allowance notice", () => {
  it("See plans opens the paywall, not the settings page", () => {
    const info = jest.spyOn(notify, "info").mockImplementation(() => "");
    notifyBoardsBlocked();
    const opts = info.mock.calls[0][1] as { action: { onClick: () => void } };
    usePaywallStore.getState().close();
    opts.action.onClick();
    expect(usePaywallStore.getState().open).toBe(true);
    expect(usePaywallStore.getState().feature).toBe("Unlimited moodboards");
    info.mockRestore();
  });
});
