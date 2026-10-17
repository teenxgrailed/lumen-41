import type { NoticeApi, NoticePayload } from "../types";

function fakeApi() {
  const raised: NoticePayload[] = [];
  const dismissed: string[] = [];
  let n = 0;
  const api: NoticeApi = {
    notify: (payload) => {
      raised.push(payload);
      n += 1;
      return `real-${n}`;
    },
    dismiss: (id) => {
      dismissed.push(id);
    },
    dismissAll: () => {
      dismissed.push("*");
    },
  };
  return { api, raised, dismissed };
}

const base = { kind: "done" as const, title: "T", body: "" };

describe("notice bridge", () => {
  let bridge: typeof import("../bridge");
  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bridge = require("../bridge");
  });

  it("sends a notice with no surface to the toast stack", () => {
    const toast = fakeApi();
    const island = fakeApi();
    bridge.setNoticeSink(toast.api, "toast");
    bridge.setNoticeSink(island.api, "island");
    bridge.raiseNotice(base);
    expect(toast.raised).toHaveLength(1);
    expect(island.raised).toHaveLength(0);
  });

  it("sends an island notice to the island and not the toast stack", () => {
    const toast = fakeApi();
    const island = fakeApi();
    bridge.setNoticeSink(toast.api, "toast");
    bridge.setNoticeSink(island.api, "island");
    bridge.raiseNotice({ ...base, surface: "island" });
    expect(island.raised).toHaveLength(1);
    expect(toast.raised).toHaveLength(0);
  });

  it("holds a notice until its own stack mounts, whichever mounts first", () => {
    const toast = fakeApi();
    const island = fakeApi();
    bridge.raiseNotice(base);
    bridge.raiseNotice({ ...base, surface: "island" });
    bridge.setNoticeSink(island.api, "island");
    expect(island.raised).toHaveLength(1);
    expect(toast.raised).toHaveLength(0);
    bridge.setNoticeSink(toast.api, "toast");
    expect(toast.raised).toHaveLength(1);
  });

  it("drops a queued notice that was dismissed before its stack mounted", () => {
    const toast = fakeApi();
    const id = bridge.raiseNotice(base);
    bridge.dropNotice(id);
    bridge.setNoticeSink(toast.api, "toast");
    expect(toast.raised).toHaveLength(0);
  });

  it("finds the real card when a caller dismisses by the pending id", () => {
    const toast = fakeApi();
    const id = bridge.raiseNotice(base);
    bridge.setNoticeSink(toast.api, "toast");
    bridge.dropNotice(id);
    expect(toast.dismissed).toEqual(["real-1"]);
  });

  it("clears every stack when told to drop everything", () => {
    const toast = fakeApi();
    const island = fakeApi();
    bridge.setNoticeSink(toast.api, "toast");
    bridge.setNoticeSink(island.api, "island");
    bridge.dropNotice();
    expect(toast.dismissed).toEqual(["*"]);
    expect(island.dismissed).toEqual(["*"]);
  });
});
