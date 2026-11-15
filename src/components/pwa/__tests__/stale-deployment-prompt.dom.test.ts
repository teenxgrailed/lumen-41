/**
 * @jest-environment jsdom
 *
 * A new version is announced: the loading word goes up and the page reloads
 * by itself. There is no toast and no button.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";
import { NEW_VERSION_EVENT } from "@/lib/pwa/build-version";
import { COMMIT_MS, reloadPage } from "@/lib/pwa/safe-reload";

import { StaleDeploymentPrompt } from "../StaleDeploymentPrompt";

jest.mock("next/navigation", () => ({ usePathname: () => "/today" }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/pwa/safe-reload", () => ({
  ...jest.requireActual("@/lib/pwa/safe-reload"),
  reloadPage: jest.fn(),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  window.sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  (reloadPage as jest.Mock).mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("StaleDeploymentPrompt", () => {
  it("shows the word and reloads on a new version, with no toast", () => {
    act(() => root.render(h(StaleDeploymentPrompt)));
    expect(document.querySelector("[data-needt-loading]")).toBeNull();
    act(() => {
      window.dispatchEvent(new Event(NEW_VERSION_EVENT));
    });
    expect(document.querySelector("[data-needt-loading]")).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(COMMIT_MS);
    });
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(notify.info).not.toHaveBeenCalled();
  });

  it("waits while a field has unsaved typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => root.render(h(StaleDeploymentPrompt)));
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    act(() => {
      window.dispatchEvent(new Event(NEW_VERSION_EVENT));
      jest.advanceTimersByTime(30_000);
    });
    expect(reloadPage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-needt-loading]")).toBeNull();
    input.remove();
  });
});
