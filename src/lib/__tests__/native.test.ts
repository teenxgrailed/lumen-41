/** @jest-environment node */
import {
  haptic,
  isNativeApp,
  isStoreDistribution,
  registerNativePush,
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
    await expect(registerNativePush()).resolves.toBe(false);
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
