/**
 * @jest-environment jsdom
 *
 * Nothing the product says on its own reaches the sign-in pages: a stale
 * session's nudges were stacked over the form. The bridge drops every notice
 * there, whichever surface it asks for, and speaks again everywhere else.
 */
import type { NoticeApi, NoticePayload } from "../types";

function fakeApi() {
  const raised: NoticePayload[] = [];
  const api: NoticeApi = {
    notify: (payload) => {
      raised.push(payload);
      return `real-${raised.length}`;
    },
    dismiss: () => undefined,
    dismissAll: () => undefined,
  };
  return { api, raised };
}

const base = { kind: "agent" as const, title: "Deadline at risk", body: "" };

describe("the notice bridge on the sign-in pages", () => {
  let bridge: typeof import("../bridge");
  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bridge = require("../bridge");
  });

  it.each(["/auth/signin", "/auth/reset-password"])(
    "drops island and toast notices on %s",
    (path) => {
      window.history.pushState({}, "", path);
      const toast = fakeApi();
      const island = fakeApi();
      bridge.setNoticeSink(toast.api, "toast");
      bridge.setNoticeSink(island.api, "island");
      bridge.raiseNotice({ ...base, surface: "island" });
      bridge.raiseNotice({ ...base, surface: "toast" });
      bridge.raiseNotice(base);
      expect(island.raised).toHaveLength(0);
      expect(toast.raised).toHaveLength(0);
    }
  );

  it("does not queue them for a stack that mounts later", () => {
    window.history.pushState({}, "", "/auth/signin");
    bridge.raiseNotice({ ...base, surface: "island" });
    window.history.pushState({}, "", "/today");
    const island = fakeApi();
    bridge.setNoticeSink(island.api, "island");
    expect(island.raised).toHaveLength(0);
  });

  it("speaks as before everywhere else", () => {
    window.history.pushState({}, "", "/today");
    const island = fakeApi();
    bridge.setNoticeSink(island.api, "island");
    bridge.raiseNotice({ ...base, surface: "island" });
    expect(island.raised).toHaveLength(1);
  });
});
