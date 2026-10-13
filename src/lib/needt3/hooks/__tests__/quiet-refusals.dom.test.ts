/**
 * @jest-environment jsdom
 *
 * A refusal the caller answers itself (the plan said no; the board is full)
 * still reverts the cache and still throws, but the mutation's generic
 * "Could not ..." notice stays quiet. Any other failure keeps it.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useAddBoardItem } from "../boards";
import {
  ApiError,
  isBoardFull,
  isUpgradeRequired,
  isUploadRefusal,
} from "../core";
import { useCreateHabit } from "../habits";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => mockError(...a),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

const reply = (status: number, body: unknown) => ({
  ok: false,
  status,
  statusText: "",
  text: async () => JSON.stringify(body),
});

let host: HTMLDivElement;
let root: Root;
let answer: ReturnType<typeof reply>;
const api: {
  habit?: ReturnType<typeof useCreateHabit>;
  quietHabit?: ReturnType<typeof useCreateHabit>;
  item?: ReturnType<typeof useAddBoardItem>;
} = {};

function Probe() {
  api.habit = useCreateHabit();
  api.quietHabit = useCreateHabit({ quiet: isUpgradeRequired });
  api.item = useAddBoardItem();
  return null;
}

beforeEach(() => {
  mockError.mockReset();
  global.fetch = jest.fn(async () => answer) as unknown as typeof fetch;
  const client = new QueryClient();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const draft = { draft: { title: "Stretch" } };

describe("the detectors", () => {
  it("read the status and the message the server sends", () => {
    expect(isUpgradeRequired(new ApiError(403, "UPGRADE_REQUIRED"))).toBe(true);
    expect(
      isUpgradeRequired(new ApiError(403, "Moodboard access denied"))
    ).toBe(false);
    expect(isUpgradeRequired(new Error("UPGRADE_REQUIRED"))).toBe(false);
    expect(isBoardFull(new ApiError(409, "Moodboard is full"))).toBe(true);
    expect(isBoardFull(new ApiError(403, "x"))).toBe(false);
    // a 409 that is not "full" (a board with too many unused pictures) is not "full"
    expect(isBoardFull(new ApiError(409, "too many unused pictures"))).toBe(
      false
    );
    expect(isUploadRefusal(new ApiError(413, "big"))).toBe(true);
    expect(isUploadRefusal(new ApiError(415, "type"))).toBe(true);
    expect(isUploadRefusal(new ApiError(409, "too many unused pictures"))).toBe(
      true
    );
    expect(isUploadRefusal(new ApiError(409, "Moodboard is full"))).toBe(false);
    expect(isUploadRefusal(new ApiError(500, "boom"))).toBe(false);
  });
});

describe("a create refused by the plan", () => {
  it("throws, and says nothing when the caller asked to answer it", async () => {
    answer = reply(403, { error: "UPGRADE_REQUIRED" });
    await act(async () => {
      await expect(api.quietHabit!.mutateAsync(draft)).rejects.toMatchObject({
        status: 403,
        message: "UPGRADE_REQUIRED",
      });
    });
    expect(mockError).not.toHaveBeenCalled();
  });

  it("still shows the notice to a caller that did not (the composer)", async () => {
    answer = reply(403, { error: "UPGRADE_REQUIRED" });
    await act(async () => {
      await api.habit!.mutateAsync(draft).catch(() => undefined);
    });
    expect(mockError).toHaveBeenCalledTimes(1);
  });

  it("any other failure keeps the notice even when the caller is quiet about the plan", async () => {
    answer = reply(500, { error: "boom" });
    await act(async () => {
      await api.quietHabit!.mutateAsync(draft).catch(() => undefined);
    });
    expect(mockError).toHaveBeenCalledTimes(1);
  });
});

describe("a reference refused because the board is full", () => {
  it("throws 409 and shows no generic notice; other errors keep theirs", async () => {
    answer = reply(409, { error: "Moodboard is full", limit: 500 });
    await act(async () => {
      await expect(
        api.item!.mutateAsync({
          boardId: "b1",
          draft: { kind: "note", text: "x" },
        })
      ).rejects.toMatchObject({ status: 409 });
    });
    expect(mockError).not.toHaveBeenCalled();
    answer = reply(403, { error: "Moodboard access denied" });
    await act(async () => {
      await api
        .item!.mutateAsync({
          boardId: "b1",
          draft: { kind: "note", text: "x" },
        })
        .catch(() => undefined);
    });
    expect(mockError).toHaveBeenCalledTimes(1);
  });
});
