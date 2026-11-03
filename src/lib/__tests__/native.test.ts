/** @jest-environment node */
import {
  haptic,
  isNativeApp,
  isStoreDistribution,
  nativePushPermission,
  nativePushToken,
  onNativePushTap,
  setStatusBarForTheme,
  share,
} from "@/lib/native";

const g = globalThis as unknown as { window?: unknown };

afterEach(() => {
  delete g.window;
});

describe("native bridge", () => {
  it("is a silent no-op outside the shell", async () => {
    expect(isNativeApp()).toBe(false);
    await expect(haptic("success")).resolves.toBeUndefined();
    await expect(setStatusBarForTheme("dark")).resolves.toBeUndefined();
    await expect(nativePushToken()).resolves.toBeNull();
    await expect(nativePushPermission()).resolves.toBeNull();
    expect(() => onNativePushTap(() => undefined)()).not.toThrow();
    await expect(share({ url: "https://x" })).resolves.toBe(false);
  });

  it("is a no-op in a browser that has no Capacitor", async () => {
    g.window = {};
    expect(isNativeApp()).toBe(false);
    await expect(haptic("light")).resolves.toBeUndefined();
  });

  it("calls the native plugins inside the shell", async () => {
    const impact = jest.fn().mockResolvedValue(undefined);
    const notification = jest.fn().mockResolvedValue(undefined);
    const setStyle = jest.fn().mockResolvedValue(undefined);
    g.window = {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Haptics: { impact, notification },
          StatusBar: { setStyle },
        },
      },
    };
    await haptic("light");
    await haptic("success");
    await setStatusBarForTheme("dim");
    await setStatusBarForTheme("paper");
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
    expect(setStyle).toHaveBeenNthCalledWith(1, { style: "DARK" });
    expect(setStyle).toHaveBeenNthCalledWith(2, { style: "LIGHT" });
  });

  it("never throws when a native call fails", async () => {
    g.window = {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Haptics: { impact: jest.fn().mockRejectedValue(new Error("boom")) },
        },
      },
    };
    await expect(haptic("light")).resolves.toBeUndefined();
  });
});

describe("isStoreDistribution", () => {
  it("is false on the server", () => {
    expect(isStoreDistribution()).toBe(false);
  });

  it("is false in a browser tab", () => {
    g.window = {};
    expect(isStoreDistribution()).toBe(false);
  });

  it("is true in the iOS shell", () => {
    g.window = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
    };
    expect(isStoreDistribution()).toBe(true);
  });

  it("is false in a non-iOS Capacitor shell", () => {
    g.window = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    };
    expect(isStoreDistribution()).toBe(false);
  });

  it("is true in the Mac App Store build", () => {
    g.window = {
      __needtNative: { platform: "mac-swift", distribution: "appstore" },
    };
    expect(isStoreDistribution()).toBe(true);
  });

  it("is false in the direct-download Mac build", () => {
    g.window = {
      __needtNative: { platform: "mac-swift", distribution: "direct" },
    };
    expect(isStoreDistribution()).toBe(false);
    g.window = { __needtNative: { platform: "mac-swift" } };
    expect(isStoreDistribution()).toBe(false);
    g.window = { __needtNative: {} };
    expect(isStoreDistribution()).toBe(false);
  });
});

describe("APNs on iOS", () => {
  function iosShell(push: Record<string, unknown>) {
    g.window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "ios",
        Plugins: { PushNotifications: push },
      },
      location: { origin: "https://use.needt.app" },
    };
  }

  it("resolves with the token the registration event brings", async () => {
    const listeners: Record<string, (data: unknown) => void> = {};
    const register = jest.fn(async () => {
      listeners.registration?.({ value: "ab".repeat(32) });
    });
    iosShell({
      register,
      checkPermissions: async () => ({ receive: "granted" }),
      addListener: async (event: string, fn: (data: unknown) => void) => {
        listeners[event] = fn;
        return { remove: jest.fn() };
      },
    });
    await expect(nativePushPermission()).resolves.toBe("granted");
    await expect(nativePushToken(1000)).resolves.toBe("ab".repeat(32));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("opens only same-origin paths from a tapped notification", async () => {
    let tap: ((data: unknown) => void) | undefined;
    const remove = jest.fn();
    iosShell({
      addListener: async (event: string, fn: (data: unknown) => void) => {
        if (event === "pushNotificationActionPerformed") tap = fn;
        return { remove };
      },
    });
    const open = jest.fn();
    const stop = onNativePushTap(open);
    await Promise.resolve();
    await Promise.resolve();
    const send = (url: unknown) => tap?.({ notification: { data: { url } } });
    send("/today?task=1");
    send("//evil.example/x");
    send("/\\evil.example");
    send("https://evil.example");
    send("/\t/evil.example");
    send(42);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/today?task=1");
    stop();
    expect(remove).toHaveBeenCalled();
  });
});
