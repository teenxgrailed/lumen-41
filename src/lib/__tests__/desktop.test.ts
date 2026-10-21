import {
  desktopPlatform,
  desktopVibrancy,
  emitDesktopEvent,
  isDesktopApp,
  onDesktopCommand,
  parseDesktopCommand,
  sendDesktopNotification,
} from "@/lib/desktop";

type TestGlobal = { window?: unknown };

describe("desktop bridge", () => {
  afterEach(() => {
    delete (globalThis as TestGlobal).window;
  });

  it("is a no-op without a window", async () => {
    expect(isDesktopApp()).toBe(false);
    expect(await sendDesktopNotification("a")).toBe(false);
  });

  it("is a no-op in a plain browser", async () => {
    (globalThis as TestGlobal).window = {};
    expect(isDesktopApp()).toBe(false);
    expect(await sendDesktopNotification("a")).toBe(false);
  });

  it("sends through the Tauri notification plugin when permitted", async () => {
    const sendNotification = jest.fn();
    (globalThis as TestGlobal).window = {
      __TAURI__: {
        notification: {
          isPermissionGranted: async () => true,
          sendNotification,
        },
      },
    };
    expect(isDesktopApp()).toBe(true);
    expect(await sendDesktopNotification("Title", "Body")).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Title",
      body: "Body",
    });
  });

  it("returns false when permission is denied", async () => {
    const sendNotification = jest.fn();
    (globalThis as TestGlobal).window = {
      __TAURI__: {
        notification: {
          isPermissionGranted: async () => false,
          requestPermission: async () => "denied",
          sendNotification,
        },
      },
    };
    expect(await sendDesktopNotification("Title")).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("desktop shell commands", () => {
  afterEach(() => {
    delete (globalThis as TestGlobal).window;
  });

  it("accepts only the commands the shell can send", () => {
    expect(parseDesktopCommand({ type: "new-task" })).toEqual({
      type: "new-task",
    });
    expect(
      parseDesktopCommand({ type: "navigate", path: "/calendar" })
    ).toEqual({ type: "navigate", path: "/calendar" });
    expect(parseDesktopCommand({ type: "open-task", id: "ck_12-x" })).toEqual({
      type: "open-task",
      id: "ck_12-x",
    });
    for (const type of ["focus-toggle", "focus-end", "focus-start-next"]) {
      expect(parseDesktopCommand({ type })).toEqual({ type });
    }
    for (const bad of [
      null,
      "new-task",
      {},
      { type: "eval", code: "1" },
      { type: "navigate" },
      { type: "navigate", path: "https://evil.example" },
      { type: "navigate", path: "//evil.example" },
      { type: "navigate", path: "/a b" },
      { type: "navigate", path: "/\\evil" },
      { type: "open-task", id: "../x" },
      { type: "open-task", id: 5 },
    ]) {
      expect(parseDesktopCommand(bad)).toBeNull();
    }
  });

  it("delivers commands to the page's handler and lets go on cleanup", () => {
    const installed: { fn: ((raw: unknown) => void) | null } = { fn: null };
    (globalThis as TestGlobal).window = {
      __TAURI__: {},
      __needtDesktop: {
        platform: "mac",
        setHandler: (fn: ((raw: unknown) => void) | null) => {
          installed.fn = fn;
        },
      },
    };
    expect(desktopPlatform()).toBe("mac");
    const seen: unknown[] = [];
    const stop = onDesktopCommand((c) => seen.push(c));
    installed.fn?.({ type: "palette" });
    installed.fn?.({ type: "nope" });
    expect(seen).toEqual([{ type: "palette" }]);
    stop();
    expect(installed.fn).toBeNull();
  });

  it("reports vibrancy only on macOS and only when the shell says so", () => {
    const host = (platform: string, vibrancy?: boolean) => ({
      __TAURI__: {},
      __needtDesktop: { platform, vibrancy },
    });
    (globalThis as TestGlobal).window = host("mac", true);
    expect(desktopVibrancy()).toBe(true);
    // An older shell sends no flag: the sidebar stays opaque.
    (globalThis as TestGlobal).window = host("mac");
    expect(desktopVibrancy()).toBe(false);
    (globalThis as TestGlobal).window = host("windows", true);
    expect(desktopVibrancy()).toBe(false);
    (globalThis as TestGlobal).window = {};
    expect(desktopVibrancy()).toBe(false);
  });

  it("is inert in a browser", () => {
    (globalThis as TestGlobal).window = {};
    expect(desktopPlatform()).toBeNull();
    const stop = onDesktopCommand(() => undefined);
    expect(() => stop()).not.toThrow();
    expect(() => emitDesktopEvent("x", 1)).not.toThrow();
  });

  it("emits through the shell's event channel", () => {
    const emit = jest.fn();
    (globalThis as TestGlobal).window = { __TAURI__: { event: { emit } } };
    emitDesktopEvent("needt-tray-state", { open: 2 });
    expect(emit).toHaveBeenCalledWith("needt-tray-state", { open: 2 });
  });
});
