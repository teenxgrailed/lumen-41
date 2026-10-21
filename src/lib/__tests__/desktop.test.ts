import { isDesktopApp, sendDesktopNotification } from "@/lib/desktop";

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
