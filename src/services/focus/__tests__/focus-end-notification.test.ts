import { deliverPush } from "@/services/reminders/reminder-delivery";
import { FocusSessionPhase } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { scheduleFocusEnd } from "@/lib/queue/enqueue";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { deliverFocusEnded } from "../focus-end-notification";

jest.mock("@/lib/prisma", () => ({
  prisma: { focusSession: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/queue/enqueue", () => ({ scheduleFocusEnd: jest.fn() }));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const NOW = new Date("2026-10-19T10:25:00.000Z");
const findUnique = jest.mocked(prisma.focusSession.findUnique);
const push = jest.mocked(deliverPush);

const subs = [
  { id: "p1", endpoint: "https://a", p256dh: "k", auth: "a" },
  { id: "p2", endpoint: "https://b", p256dh: "k", auth: "a" },
];

function row(over: Record<string, unknown> = {}, focusEnded?: boolean) {
  findUnique.mockResolvedValue({
    id: "s1",
    userId: "u1",
    startedAt: new Date("2026-10-19T10:00:00.000Z"),
    endedAt: null,
    pausedAt: null,
    pausedTotalSeconds: 0,
    plannedMinutes: 25,
    phase: FocusSessionPhase.FOCUS,
    intention: "Write the spec",
    task: { title: "Write regression test" },
    user: {
      pushSubscriptions: subs,
      notificationSettings: focusEnded === undefined ? null : { focusEnded },
    },
    ...over,
  } as never);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  jest.clearAllMocks();
  push.mockResolvedValue(true);
});
afterEach(() => jest.useRealTimers());

describe("deliverFocusEnded", () => {
  it("pushes 'Focus done' with the task and length to every device", async () => {
    row();
    const result = await deliverFocusEnded("s1");
    expect(result).toEqual({ sent: true, pushes: 2, enabled: true });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith(subs[0], {
      title: "Focus done",
      body: "Write regression test · 25 min",
      url: "/today",
    });
    expect(publishRealtimeEvent).toHaveBeenCalledWith("u1", "focus-ended", {
      sessionId: "s1",
      status: "notify",
      message: "Write regression test · 25 min",
    });
  });

  it("falls back to the intention, then 'Focus', for a task-less session", async () => {
    row({ task: null });
    await deliverFocusEnded("s1");
    expect(push.mock.calls[0][1].body).toBe("Write the spec · 25 min");
    row({ task: null, intention: null });
    await deliverFocusEnded("s1");
    expect(push.mock.calls[2][1].body).toBe("Focus · 25 min");
  });

  it("sends no push when the Focus ended setting is off, and refreshes open apps silently", async () => {
    row({}, false);
    const result = await deliverFocusEnded("s1");
    expect(result).toEqual({ sent: true, pushes: 0, enabled: false });
    expect(push).not.toHaveBeenCalled();
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      "u1",
      "focus-ended",
      expect.objectContaining({ status: "silent" })
    );
  });

  it("is on when the user has no settings row yet", async () => {
    row({}, undefined);
    await expect(deliverFocusEnded("s1")).resolves.toMatchObject({
      enabled: true,
    });
  });

  it("stays quiet for an ended, paused or missing session", async () => {
    row({ endedAt: NOW });
    await expect(deliverFocusEnded("s1")).resolves.toEqual({
      sent: false,
      reason: "over",
    });
    row({ pausedAt: NOW });
    await expect(deliverFocusEnded("s1")).resolves.toEqual({
      sent: false,
      reason: "paused",
    });
    findUnique.mockResolvedValue(null);
    await expect(deliverFocusEnded("s1")).resolves.toEqual({
      sent: false,
      reason: "gone",
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("an extended session moves the job instead of sending", async () => {
    row({ plannedMinutes: 35 });
    await expect(deliverFocusEnded("s1")).resolves.toEqual({
      sent: false,
      reason: "rescheduled",
    });
    expect(scheduleFocusEnd).toHaveBeenCalledWith(
      "s1",
      new Date("2026-10-19T10:35:00.000Z")
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("one dead subscription does not stop the others", async () => {
    row();
    push.mockRejectedValueOnce(new Error("gone")).mockResolvedValueOnce(true);
    await expect(deliverFocusEnded("s1")).resolves.toMatchObject({
      pushes: 1,
    });
  });
});
