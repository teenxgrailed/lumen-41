import { NextRequest } from "next/server";

import { POST } from "../route";

const create = jest.fn();
const access = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: (args: unknown) => create(args) },
    taskReminder: { createMany: jest.fn() },
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(async () => ({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  })),
}));
jest.mock("@/lib/auth/page-auth", () => ({
  resolvePageAccess: (...args: unknown[]) => access(...args),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn(async () => "PRO"),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isTaskPlacementBlocked: jest.fn(async () => false),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/tasks originPageId", () => {
  beforeEach(() => {
    create.mockReset();
    access.mockReset();
    create.mockImplementation(async ({ data }) => ({
      id: "t1",
      deadline: null,
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      ...data,
    }));
  });

  it("stores the page as the doc origin and answers originPageId", async () => {
    access.mockResolvedValue({ role: "EDITOR" });
    const res = await post({ title: "Ship it", originPageId: "page-1" });
    expect(res?.status).toBe(200);
    const data = create.mock.calls[0][0].data;
    expect(data.originKind).toBe("doc");
    expect(data.originId).toBe("page-1");
    expect("originPageId" in data).toBe(false);
    expect((await res!.json()).originPageId).toBe("page-1");
  });

  it("refuses a page the caller cannot read, and writes nothing", async () => {
    access.mockResolvedValue(null);
    const res = await post({ title: "Ship it", originPageId: "secret" });
    expect(res?.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("a task with no origin page answers originPageId null", async () => {
    const res = await post({ title: "Plain" });
    expect((await res!.json()).originPageId).toBeNull();
    expect(access).not.toHaveBeenCalled();
  });

  it("the explicit originKind and originId still win", async () => {
    access.mockResolvedValue({ role: "EDITOR" });
    await post({
      title: "From mail",
      originPageId: "page-1",
      originKind: "mail",
      originId: "m9",
    });
    const data = create.mock.calls[0][0].data;
    expect(data.originKind).toBe("mail");
    expect(data.originId).toBe("m9");
  });
});
