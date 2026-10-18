import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import { executeTool } from "../agent/legacy-tools";
import {
  isLearningEnabled,
  listMemoriesForUse,
  rememberForUser,
} from "../memory";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("../memory", () => ({
  ...jest.requireActual("../memory"),
  isLearningEnabled: jest.fn(),
  listMemoriesForUse: jest.fn(),
  rememberForUser: jest.fn(),
}));

const workspace = {
  workspaceId: "ws-1",
  role: "OWNER",
  dataScope: { mode: "workspace", workspaceId: "ws-1" },
} as WorkspaceAccess;
const run = (name: string, args: Record<string, unknown>) =>
  executeTool(
    {} as never,
    { id: "c1", name, arguments: args } as never,
    "user-1",
    workspace,
    false
  );

beforeEach(() => jest.clearAllMocks());

describe("Ask and memories", () => {
  it("saves a stated preference when learning is on, and says so in the reply", async () => {
    (isLearningEnabled as jest.Mock).mockResolvedValue(true);
    (rememberForUser as jest.Mock).mockResolvedValue({
      id: "m1",
      content: "No meetings before 10",
    });
    const result = await run("remember", {
      kind: "preference",
      content: "No meetings before 10",
    });
    expect(rememberForUser).toHaveBeenCalledWith(
      "user-1",
      "ws-1",
      expect.objectContaining({
        content: "No meetings before 10",
        source: "chat",
      })
    );
    expect(result.text).toContain(
      'Saved to your memories: "No meetings before 10"'
    );
    expect(result.text).toContain("Settings, Memories");
  });

  it("saves nothing when learning is off and tells the person how to turn it on", async () => {
    (isLearningEnabled as jest.Mock).mockResolvedValue(false);
    const result = await run("remember", {
      kind: "preference",
      content: "No meetings before 10",
    });
    expect(rememberForUser).not.toHaveBeenCalled();
    expect(result.text).toMatch(/Let Needt learn about me.*off/);
  });

  it("does not save sensitive text even when on", async () => {
    (isLearningEnabled as jest.Mock).mockResolvedValue(true);
    const result = await run("remember", {
      kind: "fact",
      content: "my bank pin is 1234",
    });
    expect(rememberForUser).not.toHaveBeenCalled();
    expect(result.text).toMatch(/sensitive/);
  });

  it("lists only memories the switch allows", async () => {
    (listMemoriesForUse as jest.Mock).mockResolvedValue([]);
    const result = await run("list_memories", {});
    expect(listMemoriesForUse).toHaveBeenCalledWith("user-1", "ws-1");
    expect(result.text).toBe("No assistant memories are saved.");
  });
});
