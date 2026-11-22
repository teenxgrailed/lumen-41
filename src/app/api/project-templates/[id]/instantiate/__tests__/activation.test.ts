import { NextRequest } from "next/server";

import { recordActivation } from "@/lib/activation-events";
import { prisma } from "@/lib/prisma";

import { POST } from "../route";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    projectTemplate: { findFirst: jest.fn() },
    workspaceMember: { count: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const ctx = { params: Promise.resolve({ id: "tpl-1" }) };
const req = () =>
  new NextRequest("http://localhost/api/project-templates/tpl-1/instantiate", {
    method: "POST",
    body: JSON.stringify({}),
  });

const template = {
  id: "tpl-1",
  name: "Launch",
  description: null,
  color: null,
  icon: null,
  stages: [],
  roles: [],
  tasks: [],
  dependencies: [],
};

function transactionReturns(projectTasks: unknown[]) {
  jest.mocked(prisma.$transaction).mockImplementation((async (
    fn: (tx: unknown) => unknown
  ) =>
    fn({
      project: {
        create: async () => ({ id: "p1" }),
        findUniqueOrThrow: async () => ({ id: "p1", tasks: projectTasks }),
      },
      projectStage: { create: jest.fn() },
      task: { create: jest.fn() },
      taskDependency: { createMany: jest.fn() },
    })) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(prisma.projectTemplate.findFirst)
    .mockResolvedValue(template as never);
});

describe("POST /api/project-templates/[id]/instantiate activation", () => {
  it("records task_created once when the template made tasks", async () => {
    transactionReturns([{ id: "t1" }, { id: "t2" }]);
    const res = await POST(req(), ctx);
    expect(res?.status).toBe(201);
    expect(recordActivation).toHaveBeenCalledTimes(1);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "project_template",
    });
  });

  it("records nothing for a template with no tasks", async () => {
    transactionReturns([]);
    await POST(req(), ctx);
    expect(recordActivation).not.toHaveBeenCalled();
  });

  it("records nothing when the transaction fails", async () => {
    jest.mocked(prisma.$transaction).mockRejectedValue(new Error("db"));
    const res = await POST(req(), ctx);
    expect(res?.status).toBe(500);
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
