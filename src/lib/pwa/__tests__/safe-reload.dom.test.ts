/**
 * @jest-environment jsdom
 *
 * A new version reloads the page by itself instead of toasting, and only at a
 * moment that cannot cost work: a route change or a hidden tab, with nothing
 * dirty. Never on blur.
 */
import {
  BACKGROUND_RELOAD_MS,
  CANCEL_GRACE_MS,
  COMMIT_MS,
  createSafeReload,
} from "../safe-reload";
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

  it("a cancelled reload clears the overlay but does not reset the loop guard", () => {
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
    // Still inside the minute: no second attempt.
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The minute has passed: the open request goes at the next safe moment.
    now += 61_000;
    gate.routeChanged();
    expect(onCommit).toHaveBeenCalledTimes(2);
    gate.dispose();
  });

  it("after pagehide a slow reload is not treated as cancelled", () => {
    const { gate, reload, onCancel } = setup();
    gate.request();
    gate.routeChanged();
    jest.advanceTimersByTime(COMMIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pagehide"));
    jest.advanceTimersByTime(CANCEL_GRACE_MS * 5);
    expect(onCancel).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("after a bfcache restore (pageshow persisted) a cancelled reload clears the word again", () => {
    const { gate, onCancel } = setup();
    gate.request();
    gate.routeChanged();
    window.dispatchEvent(new Event("pagehide"));
    const show = new Event("pageshow");
    Object.defineProperty(show, "persisted", { value: true });
    window.dispatchEvent(show);
    jest.advanceTimersByTime(COMMIT_MS + CANCEL_GRACE_MS);
    expect(onCancel).toHaveBeenCalledTimes(1);
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

  describe("coming back from the background", () => {
    /** Dirty at the moment of hiding, so the hide itself reloads nothing. */
    const hideDirty = (gate: ReturnType<typeof setup>["gate"]) => {
      setUnsavedWork("page:x", true);
      gate.request();
      setVisibility("hidden");
    };

    it("hidden less than 5 minutes, then visible: no reload", () => {
      const { gate, reload, onCommit } = setup();
      hideDirty(gate);
      setUnsavedWork("page:x", false);
      now += BACKGROUND_RELOAD_MS - 1;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(onCommit).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      gate.dispose();
    });

    it("hidden 5 minutes or more, then visible, while pending: reloads with the word", () => {
      const { gate, reload, onCommit } = setup();
      hideDirty(gate);
      setUnsavedWork("page:x", false);
      now += BACKGROUND_RELOAD_MS;
      setVisibility("visible");
      expect(onCommit).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(COMMIT_MS);
      expect(reload).toHaveBeenCalledTimes(1);
      gate.dispose();
    });

    it("hidden long but nothing is pending: no reload", () => {
      const { gate, reload } = setup();
      setVisibility("hidden");
      now += BACKGROUND_RELOAD_MS * 2;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(reload).not.toHaveBeenCalled();
      gate.dispose();
    });

    it("hidden long, focus in an untouched field on return: no reload", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const { gate, reload, onCommit } = setup();
      hideDirty(gate);
      setUnsavedWork("page:x", false);
      input.focus();
      now += BACKGROUND_RELOAD_MS;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(onCommit).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      // Same return with the focus elsewhere does reload (control).
      input.blur();
      setVisibility("hidden");
      now += BACKGROUND_RELOAD_MS;
      setVisibility("visible");
      expect(onCommit).toHaveBeenCalledTimes(1);
      gate.dispose();
    });

    it("hidden long but still dirty on return: no reload", () => {
      const { gate, reload } = setup();
      hideDirty(gate);
      now += BACKGROUND_RELOAD_MS * 2;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(reload).not.toHaveBeenCalled();
      gate.dispose();
    });

    it("a request that arrives while hidden long reloads on return only if it did not at hide", () => {
      // Hide is a safe moment already: one reload, not two.
      const { gate, reload, onCommit } = setup();
      gate.request();
      setVisibility("hidden");
      jest.advanceTimersByTime(COMMIT_MS);
      expect(reload).toHaveBeenCalledTimes(1);
      now += BACKGROUND_RELOAD_MS * 2;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
      gate.dispose();
    });

    it("the loop guard still holds on return", () => {
      const store = storage();
      store.setItem("needt-version-reload", String(now - 30_000));
      const { gate, reload } = setup(store);
      hideDirty(gate);
      setUnsavedWork("page:x", false);
      now += BACKGROUND_RELOAD_MS;
      // 30 s ago + 5 min is past the minute, so move the stamp to just now.
      store.setItem("needt-version-reload", String(now - 1_000));
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(reload).not.toHaveBeenCalled();
      gate.dispose();
    });
  });

  describe("a running focus session", () => {
    it("blocks the reload on a route change", () => {
      const { gate, reload } = setup();
      setUnsavedWork("focus-session", true);
      gate.request();
      gate.routeChanged();
      jest.advanceTimersByTime(60_000);
      expect(reload).not.toHaveBeenCalled();
      setUnsavedWork("focus-session", false);
      gate.dispose();
    });

    it("blocks the reload when the tab returns from a long absence", () => {
      const { gate, reload } = setup();
      setUnsavedWork("focus-session", true);
      gate.request();
      setVisibility("hidden");
      now += BACKGROUND_RELOAD_MS * 2;
      setVisibility("visible");
      jest.advanceTimersByTime(60_000);
      expect(reload).not.toHaveBeenCalled();
      setUnsavedWork("focus-session", false);
      gate.dispose();
    });

    it("reloads on the next moment once the session has ended", () => {
      const { gate, reload } = setup();
      setUnsavedWork("focus-session", true);
      gate.request();
      gate.routeChanged();
      setUnsavedWork("focus-session", false);
      gate.routeChanged();
      jest.advanceTimersByTime(COMMIT_MS);
      expect(reload).toHaveBeenCalledTimes(1);
      gate.dispose();
    });
  });
});
