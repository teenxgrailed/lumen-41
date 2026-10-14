/**
 * The whole Focus lifecycle against the real route handlers and a real
 * Postgres (the server owns the clock; the test ages a session by moving its
 * startedAt). Skipped unless FOCUS_DB_TEST=1, with DATABASE_URL pointing at a
 * migrated throwaway database:
 *
 *   FOCUS_DB_TEST=1 DATABASE_URL=postgresql://… npx jest focus-lifecycle
 */
import { NextRequest } from "next/server";

import { GET as getReport } from "@/app/api/focus/route";
import { POST, GET as getSession } from "@/app/api/focus/session/route";

import { prisma } from "@/lib/prisma";

let userId = "";
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const run = process.env.FOCUS_DB_TEST === "1" ? describe : describe.skip;

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/focus/session", {
      method: "POST",
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
const get = async (
  handler: (r: NextRequest) => Promise<Response | undefined>
) => {
  const res = await handler(new NextRequest("http://localhost/x"));
  return res!.json();
};
const active = async () => (await get(getSession)).session;
const report = async () => get(getReport);
/** Pretend `minutes` of wall time have passed since the session began. */
const age = (id: string, minutes: number) =>
  prisma.focusSession.update({
    where: { id },
    data: { startedAt: new Date(Date.now() - minutes * 60_000) },
  });

run("focus lifecycle (real DB)", () => {
  let taskId = "";
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `focus-${Date.now()}@example.test`, name: "Focus" },
    });
    userId = user.id;
    const task = await prisma.task.create({
      data: { userId, title: "Write the brief", status: "todo" },
    });
    taskId = task.id;
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const start = async (planned = 25, extra: Record<string, unknown> = {}) =>
    (
      await (
        await post({
          action: "start",
          taskId,
          plannedMinutes: planned,
          intention: "Write the brief",
          phase: "FOCUS",
          ...extra,
        })
      ).json()
    ).session;

  it("start, pause, resume, +5, reload", async () => {
    const s = await start();
    expect(s.strictness).toBe("NORMAL");
    // a second start is refused while one runs
    const again = await post({ action: "start", plannedMinutes: 5 });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("ACTIVE_FOCUS_SESSION");
    await age(s.id, 10);
    await post({ action: "pause", sessionId: s.id });
    expect((await active()).pausedAt).not.toBeNull();
    await post({ action: "resume", sessionId: s.id });
    const after = await active();
    expect(after.pausedAt).toBeNull();
    const ext = await (
      await post({ action: "extend", sessionId: s.id, minutes: 5 })
    ).json();
    expect(ext.session.plannedMinutes).toBe(30);
    // "reload": the same row comes back from the server
    expect((await active()).id).toBe(s.id);
  });

  it("a NORMAL session ends early with one stop and no wait", async () => {
    const s = await active();
    const res = await post({
      action: "stop",
      sessionId: s.id,
      completed: false,
    });
    expect(res.status).toBe(200);
    const done = (await res.json()).session;
    expect(done.endedAt).not.toBeNull();
    expect(done.abandoned).toBe(true);
    expect(done.elapsedMinutes).toBeGreaterThanOrEqual(9);
    expect(done.elapsedMinutes).toBeLessThanOrEqual(11);
    expect(await active()).toBeNull();
  });

  it("the early-ended minutes show in today's report and on the task", async () => {
    const r = await report();
    const today = r.weeklyReport.dailyMinutes.at(-1).minutes;
    expect(today).toBeGreaterThanOrEqual(9);
    expect(r.weeklyReport.sessionsFocused).toBe(1);
    expect(r.weeklyReport.sessionsCompleted).toBe(0);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.actualFocusedMinutes).toBeGreaterThanOrEqual(9);
  });

  it("request-stop on NORMAL asks for no wait", async () => {
    const s = await start(5);
    const res = await (
      await post({ action: "request-stop", sessionId: s.id })
    ).json();
    expect(res.waitSeconds).toBe(0);
    await post({ action: "stop", sessionId: s.id, completed: false });
  });

  it("a clock that ran out completes at its planned length, even found late", async () => {
    const s = await start(25);
    await age(s.id, 600); // found ten hours later
    const done = (
      await (
        await post({ action: "stop", sessionId: s.id, completed: true })
      ).json()
    ).session;
    expect(done.completed).toBe(true);
    expect(done.elapsedMinutes).toBe(25);
    expect(new Date(done.endedAt).getTime()).toBeLessThan(Date.now() - 60_000);
  });

  it("a break never counts as focus minutes", async () => {
    const before = (await report()).weeklyReport.focusMinutes;
    const b = await start(5, { taskId: null, phase: "SHORT_BREAK" });
    await age(b.id, 5);
    await post({ action: "stop", sessionId: b.id, completed: true });
    expect((await report()).weeklyReport.focusMinutes).toBe(before);
  });

  it("a strict TIMEOUT session still waits; DEEP_FOCUS stays locked", async () => {
    const t = await start(25);
    await prisma.focusSession.update({
      where: { id: t.id },
      data: { strictness: "TIMEOUT" },
    });
    let res = await post({
      action: "stop",
      sessionId: t.id,
      completed: false,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("EXIT_DELAY_REQUIRED");
    const ask = await (
      await post({ action: "request-stop", sessionId: t.id })
    ).json();
    expect(ask.waitSeconds).toBe(5);
    res = await post({ action: "stop", sessionId: t.id, completed: false });
    expect((await res.json()).error).toBe("EXIT_DELAY_ACTIVE");
    await prisma.focusSession.update({
      where: { id: t.id },
      data: { strictness: "DEEP_FOCUS" },
    });
    res = await post({ action: "stop", sessionId: t.id, completed: false });
    expect((await res.json()).error).toBe("DEEP_FOCUS_LOCKED");
    await post({ action: "stop", sessionId: t.id, completed: true });
  });
});
