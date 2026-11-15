import { create } from "zustand";

/**
 * One hint at a time on a new account's Today: while the first-replan card is
 * waiting for an answer, "This is a sample day" and the suggested highlight
 * stay away. The card settles the question (Keep, Not now or Skip) and they
 * appear. Session only: a reload with the demo still overlapping starts again
 * with the card alone.
 */
interface FirstReplanGate {
  settled: boolean;
  /** Keep was pressed and the row is still on its way: hints keep waiting. */
  moving: boolean;
  setMoving: (moving: boolean) => void;
  settle: () => void;
  reset: () => void;
}

export const useFirstReplanGate = create<FirstReplanGate>((set) => ({
  settled: false,
  moving: false,
  setMoving: (moving) => set({ moving }),
  settle: () => set({ settled: true, moving: false }),
  reset: () => set({ settled: false, moving: false }),
}));
