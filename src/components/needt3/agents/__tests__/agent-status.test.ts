import { agentStatuses } from "../agent-status";

const NOW = Date.UTC(2026, 10, 5, 12);
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const item = (
  id: string,
  status: string,
  agent: string,
  hoursAgo = 1,
  extra = {}
) => ({
  id,
  title: `Item ${id}`,
  status,
  updatedAt: ago(hoursAgo),
  assignee: { id: agent, name: agent },
  question: null,
  ...extra,
});

describe("agentStatuses", () => {
  const agents = [
    { id: "revoked", token: { revoked: true } },
    { id: "failed", token: null },
    { id: "asks", token: null },
    { id: "busy", token: null },
    { id: "calm", token: null },
    { id: "old-failure", token: null },
  ];
  const items = [
    item("f1", "failed", "failed"),
    item("q1", "needs_owner", "asks", 1, { question: "Post at 18:00?" }),
    item("p1", "in_progress", "busy"),
    item("f2", "failed", "old-failure", 24 * 5),
  ];
  const map = agentStatuses(
    agents,
    items,
    new Set(["busy"]),
    new Map([["busy", "Week plan"]]),
    NOW
  );

  it("is red for a revoked token or a recent failure", () => {
    expect(map.get("revoked")).toEqual({
      status: "alert",
      line: "Connection expired — reconnect",
      reason: "connection expired",
    });
    expect(map.get("failed")?.status).toBe("alert");
    expect(map.get("failed")?.reason).toBe("a task failed");
  });

  it("is orange for a question waiting in Chat, even with risks", () => {
    expect(map.get("asks")).toEqual({
      status: "waiting",
      line: "Asked: Post at 18:00?",
      reason: null,
    });
  });

  it("is blue while working, green otherwise; old failures do not count", () => {
    expect(map.get("busy")?.line).toBe("Working · Week plan");
    expect(map.get("calm")?.status).toBe("ok");
    expect(map.get("old-failure")?.status).toBe("ok");
  });
});
