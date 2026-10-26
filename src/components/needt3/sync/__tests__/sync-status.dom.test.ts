/**
 * @jest-environment jsdom
 *
 * The save status of an editing surface: a dot and a label for each state,
 * the quiet fade of Saved, the popover with Retry, and nothing at all where
 * no editing surface is open.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { SAVED_WORD_MS, SyncStatus } from "../SyncStatus";
import { type SyncSource, setSyncSource } from "../sync-source";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let offline = { online: true, queued: null as number | null };
jest.mock("../../states/useOfflineQueue", () => ({
  useOfflineQueue: () => offline,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  jest.useFakeTimers();
  offline = { online: true, queued: null };
  // An editing surface is open unless a test says otherwise.
  setSyncSource("test", {});
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setSyncSource("test", null);
  jest.useRealTimers();
});

const render = () =>
  act(() => {
    root.render(
      h(QueryClientProvider, { client }, h(SyncStatus, { placement: "bar" }))
    );
  });
const btn = () =>
  host.querySelector<HTMLButtonElement>(
    "[data-sync-status]"
  ) as HTMLButtonElement;
const kind = () => btn().getAttribute("data-sync-status");
const word = () => btn().textContent;
const source = (s: SyncSource | null) => act(() => setSyncSource("test", s));
const open = () => act(() => btn().click());

describe("SyncStatus", () => {
  it("renders nothing where no editing surface is open", () => {
    setSyncSource("test", null);
    render();
    expect(host.querySelector("[data-sync-status]")).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("renders exactly one status, a dot and a label", () => {
    render();
    expect(host.querySelectorAll("[data-sync-status]")).toHaveLength(1);
    expect(btn().querySelector(".sync-status-dot")).not.toBeNull();
  });

  it("Saved is quiet at rest: just the dot", () => {
    render();
    expect(kind()).toBe("saved");
    expect(btn().hasAttribute("data-sync-quiet")).toBe(true);
  });

  it("Saved says its word after a sync, then fades to the dot", () => {
    render();
    source({ save: "saving" });
    expect(kind()).toBe("syncing");
    expect(word()).toBe("Saving…");
    source({ save: "saved" });
    expect(kind()).toBe("saved");
    expect(word()).toBe("Saved");
    expect(btn().hasAttribute("data-sync-quiet")).toBe(false);
    act(() => {
      jest.advanceTimersByTime(SAVED_WORD_MS + 10);
    });
    expect(btn().hasAttribute("data-sync-quiet")).toBe(true);
  });

  it("Saving… while the provider connects", () => {
    render();
    source({ collab: "connecting" });
    expect(kind()).toBe("syncing");
    expect(word()).toBe("Saving…");
  });

  it("Saving… while a mutation is in flight", async () => {
    render();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const run = client.getMutationCache().build(client, {
      mutationFn: () => gate,
    });
    act(() => {
      void run.execute(undefined);
    });
    expect(kind()).toBe("syncing");
    await act(async () => {
      release();
      await Promise.resolve();
      jest.advanceTimersByTime(5);
    });
    expect(kind()).toBe("saved");
  });

  it("Offline says changes are kept", () => {
    offline = { online: false, queued: 3 };
    render();
    expect(kind()).toBe("offline");
    expect(word()).toBe("Offline — changes kept");
  });

  it("Offline without a count", () => {
    offline = { online: false, queued: null };
    render();
    expect(word()).toBe("Offline — changes kept");
  });

  it("Draft kept (a failed save) is an error, not Saved", () => {
    render();
    source({ save: "failed" });
    expect(kind()).toBe("error");
    expect(word()).not.toBe("Saved");
  });

  it("a local draft only (provider disconnected) is an error", () => {
    render();
    source({ collab: "local" });
    expect(kind()).toBe("error");
    expect(word()).toBe("Draft only");
  });

  it("a synced document is Saved", () => {
    render();
    source({ collab: "synced", save: "saved" });
    expect(kind()).toBe("saved");
  });

  it("the error popover shows the details and Retry runs the source's retry", () => {
    const retry = jest.fn();
    render();
    source({ save: "failed", retry });
    expect(host.querySelector("[data-sync-pop]")).toBeNull();
    open();
    const pop = host.querySelector("[data-sync-pop]") as HTMLElement;
    expect(pop.textContent).toContain("Not saved");
    expect(pop.textContent).toContain("Draft kept on this device");
    expect(pop.textContent).toContain("Last saved");
    act(() =>
      host.querySelector<HTMLButtonElement>("[data-sync-retry]")!.click()
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a failed mutation is an error and Retry runs it again", async () => {
    render();
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("no"))
      .mockResolvedValueOnce("ok");
    const run = client.getMutationCache().build(client, { mutationFn: fn });
    await act(async () => {
      await run.execute(undefined).catch(() => undefined);
    });
    expect(kind()).toBe("error");
    open();
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-sync-retry]")!.click();
      await Promise.resolve();
      jest.advanceTimersByTime(5);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(kind()).toBe("saved");
  });

  it("offers no Retry when there is nothing to retry, and Escape closes it", () => {
    offline = { online: false, queued: 2 };
    render();
    open();
    const pop = host.querySelector("[data-sync-pop]") as HTMLElement;
    expect(pop.textContent).toContain("2 changes waiting");
    expect(host.querySelector("[data-sync-retry]")).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(host.querySelector("[data-sync-pop]")).toBeNull();
  });
});
