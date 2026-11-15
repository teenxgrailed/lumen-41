/**
 * @jest-environment jsdom
 *
 * A new version reloads the page by itself instead of toasting, and only at a
 * moment that cannot cost work: a route change or a hidden tab, with nothing
 * dirty. Never on blur.
 */
import { CANCEL_GRACE_MS, COMMIT_MS, createSafeReload } from "../safe-reload";
import { setUnsavedWork } from "../unsaved-work";

let now = 1_000_000;
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

function setup(store: ReturnType<typeof storage> | null = storage()) {
  const reload = jest.fn();
  const onCommit = jest.fn();
  const onCancel = jest.fn();
  const gate = createSafeReload({
    doc: document,
    reload,
    onCommit,
    onCancel,
    storage: store,
    now: () => now,
  });
  return { gate, reload, onCommit, onCancel };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  setVisibility("visible");
  setUnsavedWork("page:x", false);
  now += 10 * 60_000;
});
afterEach(() => jest.useRealTimers());

function typeInto(el: HTMLInputElement | HTMLTextAreaElement) {
  el.focus();
  el.value = "half a thought";
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("safe reload", () => {
  it("waits for a safe moment: a request alone does not reload", () => {
    const { gate, reload, onCommit } = setup();
    gate.request();
    jest.advanceTimersByTime(60_000);
    expect(onCommit).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("reloads on the next route change when nothing is dirty", () => {
    const { gate, reload, onCommit } = setup();
    gate.request();
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("reloads when the tab becomes hidden and nothing is dirty", () => {
    const { gate, reload } = setup();
    gate.request();
    setVisibility("hidden");
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("never reloads on blur or focus-leave", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { gate, reload } = setup();
    typeInto(input);
    gate.request();
    input.blur();
    input.value = "";
    jest.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("a route change with a typed-in field does not reload", () => {
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    const { gate, reload } = setup();
    typeInto(area);
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("a hidden tab while dirty does not reload", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { gate, reload } = setup();
    typeInto(input);
    gate.request();
    setVisibility("hidden");
    jest.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("a contenteditable with typing is dirty", () => {
    const ed = document.createElement("div");
    ed.setAttribute("contenteditable", "true");
    Object.defineProperty(ed, "isContentEditable", { value: true });
    ed.textContent = "draft";
    document.body.appendChild(ed);
    const { gate, reload } = setup();
    ed.dispatchEvent(new Event("input", { bubbles: true }));
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("a form whose value differs from its default is dirty", () => {
    document.body.innerHTML = '<form><input value="a"></form>';
    const { gate, reload } = setup();
    document.querySelector("input")!.value = "b";
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("an open dialog blocks the reload", () => {
    document.body.innerHTML = '<div role="dialog">Are you sure</div>';
    const { gate, reload } = setup();
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("focus inside an iframe blocks the reload", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    frame.focus();
    expect(document.activeElement).toBe(frame);
    const { gate, reload } = setup();
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("an unsaved page blocks the reload until it is saved", () => {
    const { gate, reload } = setup();
    setUnsavedWork("page:x", true);
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    setUnsavedWork("page:x", false);
    gate.routeChanged();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("with no storage it refuses to reload", () => {
    const { gate, reload, onCommit } = setup(null);
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(onCommit).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("a cancelled reload clears the overlay and stays open for the next safe moment", () => {
    const { gate, reload, onCommit, onCancel } = setup();
    gate.request();
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The reload ran but the page is still here: beforeunload "Stay".
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    jest.advanceTimersByTime(CANCEL_GRACE_MS);
    expect(onCancel).toHaveBeenCalledTimes(1);
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(2);
    gate.dispose();
  });

  it("reloads once, and not again within a minute", () => {
    const store = storage();
    const first = setup(store);
    first.gate.request();
    first.gate.routeChanged();
    first.gate.routeChanged();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(first.reload).toHaveBeenCalledTimes(1);
    first.gate.dispose();

    now += 30_000;
    const second = setup(store);
    second.gate.request();
    second.gate.routeChanged();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(second.reload).not.toHaveBeenCalled();
    second.gate.dispose();
  });
});
