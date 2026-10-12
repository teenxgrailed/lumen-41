/**
 * @jest-environment jsdom
 *
 * The design_v3 404: one empty state inside the shell and a way Home.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { NOT_FOUND_COPY, NotFoundFace } from "../NotFoundFace";

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

it("desktop: says nothing is here and links Home", async () => {
  await act(async () => root.render(h(NotFoundFace)));
  expect(host.querySelector('[data-v3-screen="not-found"]')).not.toBeNull();
  expect(host.textContent).toContain(NOT_FOUND_COPY.title);
  expect(host.textContent).not.toContain("404 - Page Not Found");
  expect(host.querySelector("[data-v3-404-home]")?.getAttribute("href")).toBe(
    "/today"
  );
});
