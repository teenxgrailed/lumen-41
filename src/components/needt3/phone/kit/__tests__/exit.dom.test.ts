/**
 * @jest-environment jsdom
 *
 * usePkExit: the exit plays, the commit is made, and the promise `exit`
 * returns settles with the commit's own, so a row thrown off the edge can come
 * back when the write fails. The row is released either way.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { usePkExit } from "..";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof usePkExit<{ id: string }>>;
type Commit = (t: { id: string }, kind: string) => void | Promise<unknown>;

let host: HTMLDivElement;
let root: Root;
let api: Api;
let reduced = false;

function mount(commit: Commit) {
  function Probe() {
    api = usePkExit<{ id: string }>(commit as never);
    return null;
  }
  act(() => root.render(h(Probe)));
}

/** Plays the whole exit: hold, fold, commit. */
const play = () => act(async () => void jest.advanceTimersByTime(1000));

beforeEach(() => {
  jest.useFakeTimers();
  reduced = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const T = { id: "a" };

describe("usePkExit", () => {
  it("resolves after the commit, and clears the row's phase and fold", async () => {
    const commit = jest.fn(() => Promise.resolve());
    mount(commit);
    let p!: Promise<void>;
    act(() => {
      p = api.exit(T, "done");
    });
    expect(api.phase.a).toBe("done");
    await play();
    await expect(p).resolves.toBeUndefined();
    expect(commit).toHaveBeenCalledWith(T, "done");
    expect(api.phase.a).toBeUndefined();
    expect(api.out.a).toBeUndefined();
  });

  it("a commit that throws synchronously rejects, and the row is released", async () => {
    const boom = new Error("sync");
    const commit = jest.fn(() => {
      throw boom;
    });
    mount(commit);
    let p!: Promise<void>;
    act(() => {
      p = api.exit(T, "later");
    });
    const seen = expect(p).rejects.toBe(boom);
    await play();
    await seen;
    expect(api.phase.a).toBeUndefined();
    expect(api.out.a).toBeUndefined();
  });

  it("busy is cleared after a failure: the same row can leave again", async () => {
    const commit = jest
      .fn<void | Promise<unknown>, [{ id: string }, string]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    mount(commit);
    let first!: Promise<void>;
    act(() => {
      first = api.exit(T, "later");
    });
    const failed = expect(first).rejects.toThrow("offline");
    await play();
    await failed;
    let second!: Promise<void>;
    act(() => {
      second = api.exit(T, "later");
    });
    expect(api.phase.a).toBe("later");
    await play();
    await expect(second).resolves.toBeUndefined();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("while the row is leaving, a second exit resolves at once and commits nothing", async () => {
    const commit = jest.fn(() => Promise.resolve());
    mount(commit);
    act(() => {
      void api.exit(T, "done");
    });
    let again!: Promise<void>;
    act(() => {
      again = api.exit(T, "done");
    });
    await expect(again).resolves.toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
    await play();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: a rejecting commit rejects at once, with no timers", async () => {
    reduced = true;
    const commit = jest.fn(() => Promise.reject(new Error("offline")));
    mount(commit);
    let p!: Promise<void>;
    act(() => {
      p = api.exit(T, "later");
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(api.phase.a).toBeUndefined();
    await expect(p).rejects.toThrow("offline");
  });

  it("reduced motion: a sync throw becomes a rejection, not a throw", async () => {
    reduced = true;
    const commit = jest.fn(() => {
      throw new Error("sync");
    });
    mount(commit);
    let p!: Promise<void>;
    expect(() =>
      act(() => {
        p = api.exit(T, "later");
      })
    ).not.toThrow();
    await expect(p).rejects.toThrow("sync");
  });
});
