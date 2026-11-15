import { recordActivation } from "@/lib/activation-events";
import type { PageAccessActor } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

import { decideMeetingNoteProposal } from "../meeting-note-proposals";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({
  resolvePageAccess: jest.fn(async () => true),
}));
jest.mock("@/services/scheduling/runs", () => ({
  createSchedulingRun: jest.fn(),
  executeSchedulingRun: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    meetingNoteProposal: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    task: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const actor = {
  userId: "user-1",
  workspace: { workspaceId: "ws-1" },
} as unknown as PageAccessActor;

const pageUpdatedAt = new Date("2026-11-01T10:00:00Z");

function proposal(actions: unknown[]) {
  jest.mocked(prisma.meetingNoteProposal.findFirst).mockResolvedValue({
    id: "prop-1",
    pageId: "page-1",
    pageUpdatedAt,
    actions,
    page: { id: "page-1", updatedAt: pageUpdatedAt, trashedAt: null },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.meetingNoteProposal.updateMany).mockResolvedValue({
    count: 1,
  } as never);
  jest
    .mocked(prisma.task.create)
    .mockResolvedValue({ id: "t1", title: "Send recap" } as never);
  jest
    .mocked(prisma.$transaction)
    .mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prisma)) as never);
});

describe("decideMeetingNoteProposal activation", () => {
  it("records task_created once when an approved proposal creates tasks", async () => {
    proposal([
      { type: "CREATE_TASK", title: "Send recap", schedule: false },
      { type: "CREATE_TASK", title: "Book room", schedule: false },
    ]);
    await decideMeetingNoteProposal(actor, "page-1", "prop-1", "approve");
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    expect(recordActivation).toHaveBeenCalledTimes(1);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "meeting_note",
    });
  });

  it("records nothing for a rejection", async () => {
    proposal([{ type: "CREATE_TASK", title: "Send recap", schedule: false }]);
    jest
      .mocked(prisma.meetingNoteProposal.update)
      .mockResolvedValue({ id: "prop-1" } as never);
    await decideMeetingNoteProposal(actor, "page-1", "prop-1", "reject");
    expect(recordActivation).not.toHaveBeenCalled();
  });

  it("records nothing when another request already claimed the proposal", async () => {
    proposal([{ type: "CREATE_TASK", title: "Send recap", schedule: false }]);
    jest.mocked(prisma.meetingNoteProposal.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    const result = await decideMeetingNoteProposal(
      actor,
      "page-1",
      "prop-1",
      "approve"
    );
    expect(result).toBeNull();
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
