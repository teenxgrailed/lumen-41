/**
 * @jest-environment jsdom
 *
 * A page from an old build whose chunks are gone reloads once, and only once.
 */
import {
  isDifferentBuild,
  noteServerBuild,
  resetBuildAnnouncement,
} from "../build-version";
import {
  CHUNK_RELOAD_SCRIPT,
  type ChunkGuardWindow,
  installChunkReloadGuard,
} from "../chunk-reload";

const A = "a".repeat(40);
const B = "b".repeat(40);

function fakeWindow(): ChunkGuardWindow & { reload: jest.Mock } {
  const reload = jest.fn();
  return {
    reload,
    // The document stands in for the window: capture sees descendants' errors.
    addEventListener: (t, l, c) =>
      document.addEventListener(t, l as EventListener, c),
    removeEventListener: (t, l, c) =>
      document.removeEventListener(t, l as EventListener, c),
    sessionStorage: window.sessionStorage,
    location: { reload },
  };
}

let off: () => void;
beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  off?.();
  document.head.innerHTML = "";
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installChunkReloadGuard", () => {
  it("reloads once when a stylesheet from /_next/static fails", async () => {
    const win = fakeWindow();
    off = installChunkReloadGuard(win);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/_next/static/css/abc.css";
    document.head.appendChild(link);
    link.dispatchEvent(new Event("error"));
    await flush();
    expect(win.reload).toHaveBeenCalledTimes(1);
    // A second failure inside the minute does not loop the page.
    link.dispatchEvent(new Event("error"));
    await flush();
    expect(win.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when a script chunk fails", async () => {
    const win = fakeWindow();
    off = installChunkReloadGuard(win);
    const script = document.createElement("script");
    script.src = "/_next/static/chunks/app-1234.js";
    document.head.appendChild(script);
    script.dispatchEvent(new Event("error"));
    await flush();
    expect(win.reload).toHaveBeenCalledTimes(1);
  });

  it("ignores a failing file that is not one of ours", async () => {
    const win = fakeWindow();
    off = installChunkReloadGuard(win);
    const img = document.createElement("script");
    img.src = "https://stats.example.com/script.js";
    document.head.appendChild(img);
    img.dispatchEvent(new Event("error"));
    await flush();
    expect(win.reload).not.toHaveBeenCalled();
  });

  it("reloads on a ChunkLoadError rejection", async () => {
    const win = fakeWindow();
    off = installChunkReloadGuard(win);
    const event = Object.assign(new Event("unhandledrejection"), {
      reason: Object.assign(new Error("Loading chunk 931 failed."), {
        name: "ChunkLoadError",
      }),
    });
    document.dispatchEvent(event);
    await flush();
    expect(win.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for an unrelated rejection", async () => {
    const win = fakeWindow();
    off = installChunkReloadGuard(win);
    document.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("boom"),
      })
    );
    await flush();
    expect(win.reload).not.toHaveBeenCalled();
  });

  it("clears the static caches but keeps the signed-in ones", async () => {
    const del = jest.fn(async () => true);
    const win = {
      ...fakeWindow(),
      caches: {
        keys: async () => ["needt-static-v8-x", "needt-private-v5:pages:1"],
        delete: del,
      },
    } as unknown as ChunkGuardWindow & { reload: jest.Mock };
    off = installChunkReloadGuard(win);
    document.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("Loading CSS chunk 12 failed."),
      })
    );
    await flush();
    await flush();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("needt-static-v8-x");
    expect(win.reload).toHaveBeenCalledTimes(1);
  });

  it("serialises into a self-contained inline script", () => {
    expect(CHUNK_RELOAD_SCRIPT).toContain("needt-asset-reload");
    expect(CHUNK_RELOAD_SCRIPT).toContain("(window)");
    // Evaluating it must not need any module scope.
    expect(() =>
      new Function("window", CHUNK_RELOAD_SCRIPT)({
        addEventListener: () => undefined,
      })
    ).not.toThrow();
  });
});

describe("build version", () => {
  it("compares only real release SHAs", () => {
    expect(isDifferentBuild(A, B)).toBe(true);
    expect(isDifferentBuild(A, A)).toBe(false);
    expect(isDifferentBuild("local", A)).toBe(false);
    expect(isDifferentBuild(null, A)).toBe(false);
    expect(isDifferentBuild(A, undefined)).toBe(false);
  });

  it("announces a newer server build once", () => {
    resetBuildAnnouncement();
    const prev = process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA;
    process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA = A;
    const heard = jest.fn();
    window.addEventListener("needt-new-version", heard);
    const res = {
      headers: { get: (k: string) => (k === "x-needt-build" ? B : null) },
    } as unknown as Response;
    noteServerBuild(res);
    noteServerBuild(res);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener("needt-new-version", heard);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA;
    else process.env.NEXT_PUBLIC_NEEDT_BUILD_SHA = prev;
  });
});
