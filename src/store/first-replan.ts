import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * One hint at a time on a new account's Today. With the first-replan demo the
 * hints come in a fixed order and each waits until the one before is closed:
 *
 *   card (replan, Keep) -> replanned -> sample -> review -> done
 *
 * `done` means the sequence is over and nothing is held any more (the
 * suggested highlight and the end-of-day nudge show then). The stage is kept
 * in the browser, tied to the demo task, so a reload continues where the
 * person was; a different demo (another account) starts again at the card.
 */
export type HintStage = "card" | "replanned" | "sample" | "review" | "done";

interface FirstReplanGate {
  /** The demo task the stage belongs to. */
  taskId: string | null;
  stage: HintStage;
  /** Keep was pressed and the row is still on its way: the card stays put. */
  moving: boolean;
  /** "This is a sample day" was closed in the sequence; it stays closed. */
  bannerDismissed: boolean;
  begin: (taskId: string) => void;
  setMoving: (moving: boolean) => void;
  goTo: (stage: HintStage) => void;
  dismissBanner: () => void;
  reset: () => void;
}

const memory = new Map<string, string>();
/** localStorage when it works, a Map when it throws (private windows, SSR). */
const storage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
}));

export const useFirstReplanGate = create<FirstReplanGate>()(
  persist(
    (set) => ({
      taskId: null,
      stage: "card",
      moving: false,
      bannerDismissed: false,
      begin: (taskId) =>
        set({ taskId, stage: "card", moving: false, bannerDismissed: false }),
      setMoving: (moving) => set({ moving }),
      goTo: (stage) => set({ stage, moving: false }),
      dismissBanner: () => set({ bannerDismissed: true }),
      reset: () =>
        set({
          taskId: null,
          stage: "card",
          moving: false,
          bannerDismissed: false,
        }),
    }),
    {
      name: "needt-first-replan-hints",
      storage,
      partialize: (s) => ({
        taskId: s.taskId,
        stage: s.stage,
        bannerDismissed: s.bannerDismissed,
      }),
    }
  )
);
