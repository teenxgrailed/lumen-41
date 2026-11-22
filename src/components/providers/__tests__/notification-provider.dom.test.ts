/**
 * @jest-environment jsdom
 *
 * The nudge poll: silent on the sign-in pages, and one card at a time
 * elsewhere (the rest are already in the bell, the poll marks them delivered).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { NotificationProvider } from "../NotificationProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/today";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));
const info = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    info: (...a: unknown[]) => info(...a),
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

const nudge = (n: number) => ({
  id: `n${n}`,
  title: `Deadline at risk ${n}`,
  body: `Task ${n} needs more time than remains.`,
  deepLink: `/tasks?open=${n}`,
});

let host: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

beforeEach(() => {
  info.mockClear();
  fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ notifications: [nudge(1), nudge(2), nudge(3)] }),
  }));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = () =>
  act(async () => {
    root.render(h(NotificationProvider, null, h("span")));
  });

describe("NotificationProvider", () => {
  it("does not poll on the sign-in pages", async () => {
    pathname = "/auth/signin";
    await mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("raises one card for three nudges and says where the rest are", async () => {
    pathname = "/today";
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    const [title, options] = info.mock.calls[0];
    expect(title).toBe("Deadline at risk 1");
    expect(options.surface).toBe("island");
    expect(options.description).toContain("2 more in your inbox.");
  });
});
