import type { JSONContent } from "@tiptap/core";

import {
  PageAutosave,
  selectLatestPageRevision,
} from "@/components/pages/page-autosave";

const firstDraft: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }],
};
const latestDraft: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }],
};

describe("PageAutosave", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("coalesces rapid edits and only persists the latest document", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const removeDraft = jest.fn();
    const autosave = new PageAutosave({
      delayMs: 650,
      isOnline: () => true,
      onStateChange: jest.fn(),
      persistDraft: jest.fn(),
      removeDraft,
      save,
    });

    autosave.schedule(firstDraft);
    autosave.schedule(latestDraft);
    await jest.advanceTimersByTimeAsync(650);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(latestDraft);
    expect(removeDraft).toHaveBeenCalledTimes(1);
  });

  it("retains an offline draft and retries it when the connection returns", async () => {
    let online = false;
    const save = jest.fn().mockResolvedValue(undefined);
    const states: string[] = [];
    const autosave = new PageAutosave({
      delayMs: 650,
      isOnline: () => online,
      onStateChange: (state) => states.push(state),
      persistDraft: jest.fn(),
      removeDraft: jest.fn(),
      save,
    });

    autosave.schedule(latestDraft);
    await jest.advanceTimersByTimeAsync(650);
    expect(states.at(-1)).toBe("offline");
    expect(save).not.toHaveBeenCalled();

    online = true;
    autosave.retryWhenOnline();
    await Promise.resolve();

    expect(save).toHaveBeenCalledWith(latestDraft);
    expect(states.at(-1)).toBe("saved");
  });

  it("cancels a pending REST write but keeps its draft until collaboration syncs", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const removeDraft = jest.fn();
    const autosave = new PageAutosave({
      delayMs: 650,
      isOnline: () => true,
      onStateChange: jest.fn(),
      persistDraft: jest.fn(),
      removeDraft,
      save,
    });

    autosave.schedule(latestDraft);
    expect(autosave.hasPendingWrite()).toBe(true);
    const handedOff = autosave.setWriteAuthority("collaboration");
    await jest.advanceTimersByTimeAsync(650);

    expect(handedOff).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(removeDraft).not.toHaveBeenCalled();
    expect(autosave.hasPendingWrite()).toBe(false);
  });

  it("preserves a durable draft when collaboration owns a newly opened page", () => {
    const removeDraft = jest.fn();
    const autosave = new PageAutosave({
      isOnline: () => true,
      onStateChange: jest.fn(),
      persistDraft: jest.fn(),
      removeDraft,
      save: jest.fn(),
    });

    autosave.setWriteAuthority("collaboration");

    expect(removeDraft).not.toHaveBeenCalled();
  });

  it("keeps a recovery draft without using REST while collaboration owns the page", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const persistDraft = jest.fn();
    const removeDraft = jest.fn();
    const autosave = new PageAutosave({
      delayMs: 650,
      isOnline: () => true,
      onStateChange: jest.fn(),
      persistDraft,
      removeDraft,
      save,
    });

    autosave.setWriteAuthority("collaboration");
    autosave.schedule(latestDraft);
    await jest.advanceTimersByTimeAsync(650);

    expect(save).not.toHaveBeenCalled();
    expect(persistDraft).toHaveBeenCalledWith(latestDraft);
    expect(removeDraft).not.toHaveBeenCalled();
    expect(autosave.hasPendingWrite()).toBe(true);
  });

  it("keeps disconnected collaboration edits durable without using REST", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const persistDraft = jest.fn();
    const onStateChange = jest.fn();
    const autosave = new PageAutosave({
      delayMs: 650,
      isOnline: () => true,
      onStateChange,
      persistDraft,
      removeDraft: jest.fn(),
      save,
    });

    autosave.setWriteAuthority("collaboration-offline");
    autosave.schedule(latestDraft);
    await jest.advanceTimersByTimeAsync(650);

    expect(persistDraft).toHaveBeenCalledWith(latestDraft);
    expect(onStateChange).toHaveBeenCalledWith("offline");
    expect(autosave.hasPendingWrite()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("removes a recovered draft only after collaboration acknowledges every update", () => {
    const removeDraft = jest.fn();
    const onStateChange = jest.fn();
    const autosave = new PageAutosave({
      isOnline: () => true,
      onStateChange,
      persistDraft: jest.fn(),
      removeDraft,
      save: jest.fn(),
    });

    autosave.setWriteAuthority("collaboration");
    expect(removeDraft).not.toHaveBeenCalled();

    expect(autosave.acknowledgeCollaborationSync(1)).toBe(false);
    expect(removeDraft).not.toHaveBeenCalled();

    expect(autosave.acknowledgeCollaborationSync(0)).toBe(true);

    expect(removeDraft).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith("saved");
  });

  describe("typing cost", () => {
    const make = (
      over: Partial<ConstructorParameters<typeof PageAutosave>[0]> = {}
    ) => {
      const persistDraft = jest.fn();
      const save = jest.fn().mockResolvedValue(undefined);
      const autosave = new PageAutosave({
        delayMs: 650,
        isOnline: () => true,
        onStateChange: jest.fn(),
        persistDraft,
        removeDraft: jest.fn(),
        save,
        ...over,
      });
      return { autosave, persistDraft, save };
    };

    it("serialises the page once per pause, not once per keystroke", async () => {
      const { autosave, persistDraft, save } = make();
      const read = jest.fn(() => latestDraft);

      for (let key = 0; key < 40; key += 1) {
        autosave.schedule(read);
        await jest.advanceTimersByTimeAsync(30);
      }
      // 40 keystrokes, 30 ms apart: nothing was read or written while typing.
      expect(read).not.toHaveBeenCalled();
      expect(persistDraft).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(700);

      // One read serves the draft and the save of the same revision.
      expect(read).toHaveBeenCalledTimes(1);
      expect(persistDraft).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(latestDraft);
    });

    it("still writes the draft during a long run of typing", async () => {
      const { autosave, persistDraft } = make();
      for (let key = 0; key < 100; key += 1) {
        autosave.schedule(() => latestDraft);
        await jest.advanceTimersByTimeAsync(100);
      }
      // Never a 250 ms pause, yet the draft is written at least every 2 s.
      expect(persistDraft.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it("writes the draft now when asked, and when the page goes away", () => {
      const { autosave, persistDraft } = make();
      autosave.schedule(() => firstDraft);
      autosave.persistDraftNow();
      expect(persistDraft).toHaveBeenCalledWith(firstDraft);

      autosave.schedule(() => latestDraft);
      autosave.dispose();
      expect(persistDraft).toHaveBeenLastCalledWith(latestDraft);
    });

    it("does not rewrite a draft the save has already removed", async () => {
      const { autosave, persistDraft } = make({ draftDelayMs: 1_000 });
      autosave.schedule(latestDraft);
      await jest.advanceTimersByTimeAsync(650); // saved, draft removed
      await jest.advanceTimersByTimeAsync(2_000);
      expect(persistDraft).not.toHaveBeenCalled();
    });

    it("puts the latest edit in the draft before handing the page to collaboration", () => {
      const { autosave, persistDraft } = make();
      autosave.schedule(() => latestDraft);
      expect(persistDraft).not.toHaveBeenCalled();
      autosave.setWriteAuthority("collaboration");
      expect(persistDraft).toHaveBeenCalledWith(latestDraft);
    });

    it("survives an editor destroyed under the reader", () => {
      const { autosave, persistDraft } = make();
      autosave.schedule(() => {
        throw new Error("destroyed");
      });
      expect(() => autosave.dispose()).not.toThrow();
      expect(persistDraft).not.toHaveBeenCalled();
    });
  });

  it("never regresses the page revision when responses arrive out of order", () => {
    const firstCommit = 41;
    const secondCommit = 42;

    const latest = selectLatestPageRevision(secondCommit, firstCommit);

    expect(latest).toBe(secondCommit);
  });
});
