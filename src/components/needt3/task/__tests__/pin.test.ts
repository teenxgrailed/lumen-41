import type { V3Task } from "@/lib/needt3/map";

import {
  canPinHere,
  canUnpin,
  isPinned,
  pinPatch,
  pinTitle,
  unpinPatch,
} from "../pin";
import { taskView } from "../view";

const base = {
  id: "t",
  title: "Write the brief",
  done: false,
  isFixed: false,
  auto: true,
  trashedAt: null,
  estimatedMinutes: 45,
  scheduledStart: "2026-10-16T14:00",
  scheduledEnd: "2026-10-16T14:45",
} as unknown as V3Task;

const TIP = "Pinned at 14:00 — the scheduler won't move it";

describe("pin model", () => {
  it("is pinned only when fixed, open and timed", () => {
    expect(isPinned({ ...base, isFixed: true })).toBe(true);
    expect(isPinned({ ...base, isFixed: true, done: true })).toBe(false);
    expect(isPinned({ ...base, isFixed: true, scheduledStart: null })).toBe(
      false
    );
    expect(isPinned(base)).toBe(false);
  });

  it("offers Pin here to a timed unpinned task, the way back to a pinned one", () => {
    expect(canPinHere(base)).toBe(true);
    expect(canUnpin(base)).toBe(false);
    expect(canPinHere({ ...base, scheduledStart: null })).toBe(false);
    expect(canPinHere({ ...base, isFixed: true })).toBe(false);
    expect(canUnpin({ ...base, isFixed: true })).toBe(true);
  });

  it("pins in place with the start and end the server freezes", () => {
    expect(pinPatch(base)).toEqual({
      isFixed: true,
      auto: false,
      scheduledStart: "2026-10-16T14:00",
      scheduledEnd: "2026-10-16T14:45",
    });
    expect(
      pinPatch({ ...base, scheduledEnd: null, estimatedMinutes: null })
    ).toMatchObject({ scheduledEnd: "2026-10-16T14:30" });
  });

  it("unpinning hands the task back to the scheduler", () => {
    expect(unpinPatch()).toEqual({ isFixed: false, auto: true });
  });

  it("words the tooltip and puts it on the task view", () => {
    expect(pinTitle(base)).toBe(TIP);
    const v = taskView({ ...base, isFixed: true }, [], "2026-10-16");
    expect(v.pinned).toBe(true);
    expect(v.pinTitle).toBe(TIP);
    expect(taskView(base, [], "2026-10-16").pinned).toBe(false);
  });
});
