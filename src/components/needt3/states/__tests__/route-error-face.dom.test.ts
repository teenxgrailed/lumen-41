/**
 * @jest-environment jsdom
 *
 * Route error boundary: one card inside the shell, Retry resets the segment,
 * Go home leads to /today, and the exception reaches Sentry.
 */
import { act, createElement as h } from "react";

import * as Sentry from "@sentry/nextjs";
import { type Root, createRoot } from "react-dom/client";

import { ROUTE_ERROR_COPY, RouteErrorFace } from "../RouteErrorFace";

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/needt3/fonts", () => ({ V3_FONT_CLASSES: "" }));
jest.mock("@/styles/v3-entry.css", () => ({}), { virtual: true });
jest.mock("@/components/settings/AccountSettings", () => ({
  AccountSettings: () => null,
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  signOut: jest.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders an in-shell card with Retry and Go home, and reports to Sentry", async () => {
  const reset = jest.fn();
  const error = Object.assign(new Error("boom"), { digest: "d1" });
  await act(async () =>
    root.render(h(RouteErrorFace, { error, reset, screen: "today" }))
  );

  expect(host.querySelector('[data-route-error="today"]')).not.toBeNull();
  expect(host.textContent).toContain(ROUTE_ERROR_COPY.title);
  expect(host.textContent).not.toContain("Something went wrong");
  expect(host.querySelector("html, body")).toBeNull();
  expect(
    host.querySelector("[data-route-error-home]")?.getAttribute("href")
  ).toBe("/today");

  const retry = host.querySelector<HTMLButtonElement>(
    "[data-route-error-retry]"
  );
  await act(async () => retry?.click());
  expect(reset).toHaveBeenCalledTimes(1);

  expect(Sentry.captureException).toHaveBeenCalledWith(error, {
    tags: { route: "today" },
  });
});
