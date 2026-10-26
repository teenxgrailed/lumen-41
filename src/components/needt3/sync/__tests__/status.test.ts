import { otherPeers } from "../presence";
import { deriveSyncStatus } from "../status";

const base = {
  online: true,
  queued: null,
  mutating: 0,
  failedMutations: 0,
  source: null,
};

describe("deriveSyncStatus", () => {
  it("is Saved with nothing in flight", () => {
    expect(deriveSyncStatus(base)).toMatchObject({
      kind: "saved",
      label: "Saved",
      retryable: false,
    });
  });

  it("is Saving… while a mutation, a save or the provider is working", () => {
    expect(deriveSyncStatus({ ...base, mutating: 2 })).toMatchObject({
      kind: "syncing",
      label: "Saving…",
      waiting: "2 changes sending",
    });
    expect(deriveSyncStatus({ ...base, source: { save: "saving" } }).kind).toBe(
      "syncing"
    );
    expect(
      deriveSyncStatus({ ...base, source: { collab: "connecting" } }).kind
    ).toBe("syncing");
  });

  it("says changes are kept when offline, and counts the queue only in the details", () => {
    const view = deriveSyncStatus({ ...base, online: false, queued: 3 });
    expect(view).toMatchObject({
      kind: "offline",
      label: "Offline — changes kept",
      waiting: "3 changes waiting",
    });
    expect(
      deriveSyncStatus({ ...base, online: false, queued: 1 }).waiting
    ).toBe("1 change waiting");
    expect(
      deriveSyncStatus({ ...base, online: false, queued: 0 }).waiting
    ).toBe(null);
    expect(deriveSyncStatus({ ...base, online: false }).label).toBe(
      "Offline — changes kept"
    );
  });

  it("shows a kept draft as an error, never as Saved", () => {
    const failed = deriveSyncStatus({ ...base, source: { save: "failed" } });
    expect(failed).toMatchObject({
      kind: "error",
      label: "Not saved",
      retryable: true,
    });
    expect(failed.waiting).toBe("Draft kept on this device");
    const local = deriveSyncStatus({ ...base, source: { collab: "local" } });
    expect(local).toMatchObject({ kind: "error", retryable: true });
    expect(local.label).not.toBe("Saved");
  });

  it("is an error when a mutation failed, and offline outranks it", () => {
    expect(deriveSyncStatus({ ...base, failedMutations: 1 })).toMatchObject({
      kind: "error",
      retryable: true,
    });
    expect(
      deriveSyncStatus({ ...base, online: false, failedMutations: 1 }).kind
    ).toBe("offline");
  });

  it("is Saved with a live provider", () => {
    expect(
      deriveSyncStatus({ ...base, source: { collab: "synced", save: "saved" } })
        .kind
    ).toBe("saved");
  });
});

describe("otherPeers", () => {
  const me = { name: "Maks", color: "#111" };
  it("never lists this tab's own state", () => {
    const states = [
      { clientId: 1, user: me },
      { clientId: 2, user: { name: "Ann", color: "#222" } },
    ];
    expect(otherPeers(states, 1, me)).toEqual([{ name: "Ann", color: "#222" }]);
  });

  it("never lists you from another tab either", () => {
    expect(otherPeers([{ clientId: 9, user: me }], 1, me)).toEqual([]);
  });

  it("skips entries that are not people", () => {
    expect(
      otherPeers(
        [{ clientId: 3 }, { clientId: 4, user: { name: "x" } }],
        1,
        null
      )
    ).toEqual([]);
  });
});
