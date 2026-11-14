/**
 * @jest-environment jsdom
 *
 * Google One Tap contacts accounts.google.com only when the server says
 * Google sign-in is configured; otherwise the page never loads the script.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { GSI_SCRIPT_URL, useGoogleOneTap } from "../use-google-one-tap";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let host: HTMLDivElement;
let root: Root;
const onCredential = jest.fn();

function Probe({ enabled = true }: { enabled?: boolean }) {
  useGoogleOneTap({ enabled, onCredential });
  return null;
}

const answer = (body: unknown, ok = true) => {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok,
    json: async () => body,
  }));
};
const script = () =>
  document.head.querySelector<HTMLScriptElement>(
    `script[src="${GSI_SCRIPT_URL}"]`
  );
const mount = (enabled = true) =>
  act(async () => {
    root.render(h(Probe, { enabled }));
  });

beforeEach(() => {
  jest.clearAllMocks();
  document.head.innerHTML = "";
  delete (window as { google?: unknown }).google;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Google One Tap script", () => {
  it("is not loaded when Google is not configured", async () => {
    answer({ clientId: null });
    await mount();
    expect(script()).toBeNull();
  });

  it("is not loaded when the client id cannot be read", async () => {
    answer({}, false);
    await mount();
    expect(script()).toBeNull();
  });

  it("is not even asked for when the screen has its own sign-in", async () => {
    answer({ clientId: "id.apps.googleusercontent.com" });
    await mount(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(script()).toBeNull();
  });

  it("loads once configured, prompts, and hands the credential over", async () => {
    answer({ clientId: "id.apps.googleusercontent.com" });
    const gsi = {
      initialize: jest.fn(),
      prompt: jest.fn(),
      cancel: jest.fn(),
    };
    await mount();
    expect(script()).not.toBeNull();
    (window as { google?: unknown }).google = { accounts: { id: gsi } };
    await act(async () => {
      script()!.dispatchEvent(new Event("load"));
    });
    expect(gsi.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "id.apps.googleusercontent.com",
        auto_select: false,
      })
    );
    expect(gsi.prompt).toHaveBeenCalledTimes(1);
    gsi.initialize.mock.calls[0][0].callback({ credential: "tok.en.sig" });
    expect(onCredential).toHaveBeenCalledWith("tok.en.sig");
    act(() => root.unmount());
    expect(gsi.cancel).toHaveBeenCalled();
    root = createRoot(host);
  });
});
