/**
 * @jest-environment jsdom
 *
 * A new version reloads the page by itself instead of toasting, and waits
 * while a field is half-written.
 */
import { COMMIT_MS, createSafeReload } from "../safe-reload";

let now = 1_000_000;
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

function setup(store = storage()) {
  const reload = jest.fn();
  const onCommit = jest.fn();
  const gate = createSafeReload({
    doc: document,
    reload,
    onCommit,
    storage: store,
    now: () => now,
  });
  return { gate, reload, onCommit };
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  now += 10 * 60_000;
});
afterEach(() => jest.useRealTimers());

function typeInto(el: HTMLInputElement | HTMLTextAreaElement) {
  el.focus();
  el.value = "half a thought";
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("safe reload", () => {
  it("shows the word and reloads when nothing is being typed", () => {
    const { gate, reload, onCommit } = setup();
    gate.request();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("does not reload while a focused field has typing in it", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { gate, reload, onCommit } = setup();
    typeInto(input);
    gate.request();
    jest.advanceTimersByTime(60_000);
    expect(onCommit).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("waits for a focused contenteditable with typing too", () => {
    const ed = document.createElement("div");
    ed.contentEditable = "true";
    Object.defineProperty(ed, "isContentEditable", { value: true });
    ed.tabIndex = 0;
    document.body.appendChild(ed);
    const { gate, reload } = setup();
    ed.focus();
    ed.dispatchEvent(new Event("input", { bubbles: true }));
    gate.request();
    jest.advanceTimersByTime(5000);
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("reloads once the field loses focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { gate, reload } = setup();
    typeInto(input);
    gate.request();
    input.blur();
    jest.advanceTimersByTime(COMMIT_MS + 5);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("reloads on the next route change even with a field half-written", () => {
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    const { gate, reload, onCommit } = setup();
    typeInto(area);
    gate.request();
    expect(onCommit).not.toHaveBeenCalled();
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("a focused field nobody typed in does not hold the reload back", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const { gate, reload } = setup();
    gate.request();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it("a route change with no new version does nothing", () => {
    const { gate, reload, onCommit } = setup();
    gate.routeChanged();
    jest.advanceTimersByTime(5000);
    expect(onCommit).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("reloads once, and not again within a minute", () => {
    const store = storage();
    const first = setup(store);
    first.gate.request();
    first.gate.request();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(first.reload).toHaveBeenCalledTimes(1);
    first.gate.dispose();

    now += 30_000;
    const second = setup(store);
    second.gate.request();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(second.reload).not.toHaveBeenCalled();
    second.gate.dispose();
  });
});
