/**
 * @jest-environment jsdom
 *
 * Settings → Notifications → "This device": one row whose text and buttons
 * follow what this browser can do. Enabling asks for permission from the tap.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PushGroup } from "../PushGroup";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
let subscription: { endpoint: string; unsubscribe: jest.Mock } | null;
const subscribe = jest.fn();
const requestPermission = jest.fn();

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130";

function env(opts: {
  ua?: string;
  standalone?: boolean;
  push?: boolean;
  permission?: NotificationPermission;
  configured?: boolean;
}) {
  const {
    ua = DESKTOP,
    standalone = false,
    push = true,
    permission = "default",
    configured = true,
  } = opts;
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: "x",
    configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: standalone,
    configurable: true,
  });
  window.matchMedia = (() => ({ matches: standalone })) as never;
  if (push) {
    (window as unknown as Record<string, unknown>).PushManager = function () {};
    const registration = {
      active: {},
      pushManager: {
        getSubscription: async () => subscription,
        subscribe,
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: async () => registration,
        ready: Promise.resolve(registration),
      },
      configurable: true,
    });
    (window as unknown as Record<string, unknown>).Notification = Object.assign(
      function () {},
      { permission, requestPermission }
    );
  } else {
    delete (window as unknown as Record<string, unknown>).PushManager;
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (url === "/api/push-subscriptions" && !init?.method) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          configured,
          publicKey: configured ? "BAUQ" : null,
          subscriptions: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, status: 200 });
  });
}

async function render() {
  await act(async () => {
    root.render(h(PushGroup));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const buttons = () =>
  Array.from(host.querySelectorAll("button")).map((b) => b.textContent);

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock = jest.fn();
  global.fetch = fetchMock as never;
  subscription = null;
  subscribe.mockReset();
  requestPermission.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PushGroup", () => {
  it("asks an iPhone Safari tab to add Needt to the Home Screen first", async () => {
    env({ ua: IPHONE, standalone: false, push: false });
    await render();
    expect(host.textContent).toContain("Add Needt to Home Screen first");
    expect(buttons()).toEqual([]);
  });

  it("says plainly when the browser cannot do push", async () => {
    env({ push: false });
    await render();
    expect(host.textContent).toContain("Not supported here");
    expect(buttons()).toEqual([]);
  });

  it("explains how to unblock when permission was denied", async () => {
    env({ permission: "denied" });
    await render();
    expect(host.textContent).toContain("Blocked in the browser");
    expect(host.textContent).toContain("site settings");
    expect(buttons()).toEqual([]);
  });

  it("says so when the server has no VAPID keys", async () => {
    env({ configured: false });
    await render();
    expect(host.textContent).toContain("Not available on this server");
    expect(buttons()).toEqual([]);
  });

  it("offers Enable, which asks permission, subscribes and saves", async () => {
    env({ ua: IPHONE, standalone: true });
    requestPermission.mockResolvedValue("granted");
    const created = {
      endpoint: "https://web.push.apple.com/x",
      unsubscribe: jest.fn(),
      toJSON: () => ({ endpoint: "https://web.push.apple.com/x", keys: {} }),
    };
    subscribe.mockResolvedValue(created);
    await render();
    expect(buttons()).toEqual(["Enable notifications"]);

    await act(async () => {
      host.querySelector("button")!.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST"
    );
    expect(post?.[0]).toBe("/api/push-subscriptions");
    expect(buttons()).toEqual(["Send test notification", "Turn off"]);
  });

  it("stays off when the person dismisses the permission prompt", async () => {
    env({});
    requestPermission.mockResolvedValue("default");
    await render();
    await act(async () => {
      host.querySelector("button")!.click();
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(buttons()).toEqual(["Enable notifications"]);
  });

  it("shows Send test when already subscribed and posts this device's endpoint", async () => {
    subscription = { endpoint: "https://fcm.test/abc", unsubscribe: jest.fn() };
    (subscription as unknown as { toJSON: () => unknown }).toJSON = () => ({
      endpoint: "https://fcm.test/abc",
      keys: {},
    });
    env({ permission: "granted" });
    await render();
    expect(host.textContent).toContain("Notifications are on");
    const test = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Send test notification"
    )!;
    await act(async () => {
      test.click();
    });
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/push-subscriptions/test"
    );
    expect(JSON.parse(call![1].body)).toEqual({
      endpoint: "https://fcm.test/abc",
    });
  });
});
