import { readFileSync } from "node:fs";
import vm from "node:vm";

/*
 * The service worker's Focus-ended handling, run for real in a sandbox with a
 * fake worker scope: the push gains a "Mark done" action when it names a
 * task, and that action completes the task through the task endpoint. Any
 * other tap, or a refused Mark done, opens the app on the Done ask.
 */
const source = readFileSync("public/sw.js", "utf8");

type Handler = (event: Record<string, unknown>) => void;

function boot(fetchImpl: jest.Mock) {
  const handlers: Record<string, Handler> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const windows: unknown[] = [];
  const scope = {
    location: { origin: "https://app.needt.test" },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: () => undefined,
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(windows),
      openWindow: (href: string) => {
        opened.push(href);
        return Promise.resolve();
      },
    },
  } as Record<string, unknown>;
  scope.self = scope;
  const context = vm.createContext({
    ...scope,
    self: scope,
    fetch: fetchImpl,
    caches: { open: () => Promise.reject(new Error("no caches")) },
    // No IndexedDB: the saved workspace cannot be restored, which the handler
    // must survive.
    URL,
    Promise,
    encodeURIComponent,
    JSON,
    Response,
  });
  vm.runInContext(source, context);
  return { handlers, shown, opened, navigated, windows };
}

const pushEvent = (payload: unknown) => {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data: { json: () => payload, text: () => "" },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    done: () => Promise.all(waits),
  };
};

const clickEvent = (data: unknown, action = "") => {
  const waits: Promise<unknown>[] = [];
  const closed = jest.fn();
  return {
    event: {
      action,
      notification: { data, close: closed },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    closed,
    done: () => Promise.all(waits),
  };
};

describe("push", () => {
  it("adds Mark done when the payload names a task", async () => {
    const sw = boot(jest.fn());
    const p = pushEvent({
      title: "Focus done",
      body: "Write the spec · 25 min",
      url: "/today?focusDone=t1",
      taskId: "t1",
    });
    sw.handlers.push(p.event);
    await p.done();
    expect(sw.shown[0].title).toBe("Focus done");
    expect(sw.shown[0].options.actions).toEqual([
      { action: "mark-done", title: "Mark done" },
    ]);
    expect(sw.shown[0].options.data).toEqual({
      url: "/today?focusDone=t1",
      taskId: "t1",
    });
  });

  it("shows no action for a push without a task", async () => {
    const sw = boot(jest.fn());
    const p = pushEvent({ title: "Overdue", body: "x", url: "/today" });
    sw.handlers.push(p.event);
    await p.done();
    expect(sw.shown[0].options.actions).toBeUndefined();
  });
});

describe("notificationclick", () => {
  const data = { url: "/today?focusDone=t1", taskId: "t1" };

  it("Mark done completes the task with the session cookie and opens nothing", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    const sw = boot(fetchMock);
    const c = clickEvent(data, "mark-done");
    sw.handlers.notificationclick(c.event);
    await c.done();
    expect(c.closed).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks/t1");
    expect(init).toMatchObject({
      method: "PUT",
      credentials: "same-origin",
      body: JSON.stringify({ status: "completed" }),
    });
    expect(sw.opened).toEqual([]);
  });

  it("a refused Mark done opens the app on the Done ask", async () => {
    const sw = boot(jest.fn().mockResolvedValue({ ok: false, status: 401 }));
    const c = clickEvent(data, "mark-done");
    sw.handlers.notificationclick(c.event);
    await c.done();
    expect(sw.opened).toEqual(["https://app.needt.test/today?focusDone=t1"]);
  });

  it("an offline Mark done opens the app on the Done ask", async () => {
    const sw = boot(jest.fn().mockRejectedValue(new TypeError("offline")));
    const c = clickEvent(data, "mark-done");
    sw.handlers.notificationclick(c.event);
    await c.done();
    expect(sw.opened).toEqual(["https://app.needt.test/today?focusDone=t1"]);
  });

  it("tapping the body opens the Done ask and does not complete anything", async () => {
    const fetchMock = jest.fn();
    const sw = boot(fetchMock);
    const c = clickEvent(data);
    sw.handlers.notificationclick(c.event);
    await c.done();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sw.opened).toEqual(["https://app.needt.test/today?focusDone=t1"]);
  });

  it("an action without a task id falls back to opening the page", async () => {
    const fetchMock = jest.fn();
    const sw = boot(fetchMock);
    const c = clickEvent({ url: "/today" }, "mark-done");
    sw.handlers.notificationclick(c.event);
    await c.done();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sw.opened).toEqual(["https://app.needt.test/today"]);
  });
});
