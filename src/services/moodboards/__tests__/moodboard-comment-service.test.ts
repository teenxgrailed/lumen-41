import {
  MoodboardItemAccessError,
  MoodboardItemNotFoundError,
  MoodboardTrashedError,
} from "@/services/moodboards/moodboard-item-service";
import { MoodboardAccessRole } from "@prisma/client";

import {
  createCommentSchema,
  createItemComment,
  deleteItemComment,
  listItemComments,
  setItemCommentResolved,
} from "../moodboard-comment-service";

jest.mock("@/lib/auth/moodboard-auth", () => ({
  resolveMoodboardAccess: jest.fn(),
  moodboardRoleAtLeast: jest.requireActual("@/lib/auth/moodboard-auth")
    .moodboardRoleAtLeast,
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    moodboardItem: { findFirst: jest.fn() },
    moodboardItemComment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const { resolveMoodboardAccess } = jest.requireMock<
  typeof import("@/lib/auth/moodboard-auth")
>("@/lib/auth/moodboard-auth");
const { prisma } =
  jest.requireMock<typeof import("@/lib/prisma")>("@/lib/prisma");
const access = resolveMoodboardAccess as jest.Mock;
const itemFind = prisma.moodboardItem.findFirst as jest.Mock;
const comments = prisma.moodboardItemComment as unknown as Record<
  string,
  jest.Mock
>;

const actor = { userId: "u1" };
const RANK = { VIEWER: 0, EDITOR: 1, FULL_ACCESS: 2 } as const;

/** The mocked board answers like the real one: null when the role is too low. */
function role(mine: keyof typeof RANK, trashed = false) {
  access.mockImplementation(
    async (
      _a: unknown,
      _id: string,
      required: MoodboardAccessRole = "VIEWER" as MoodboardAccessRole
    ) =>
      RANK[mine] >= RANK[required as keyof typeof RANK]
        ? { moodboardId: "b1", role: mine, trashed }
        : null
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  itemFind.mockResolvedValue({ id: "i1" });
});

describe("moodboard item comments", () => {
  it("lets a viewer read, open comments first", async () => {
    role("VIEWER");
    comments.findMany.mockResolvedValue([{ id: "c1" }]);
    await expect(listItemComments(actor, "b1", "i1")).resolves.toEqual([
      { id: "c1" },
    ]);
    expect(comments.findMany.mock.calls[0][0].where).toEqual({
      itemId: "i1",
      moodboardId: "b1",
    });
  });

  it("refuses a viewer who writes", async () => {
    role("VIEWER");
    await expect(
      createItemComment(actor, "b1", "i1", { body: "hi" })
    ).rejects.toBeInstanceOf(MoodboardItemAccessError);
    expect(comments.create).not.toHaveBeenCalled();
  });

  it("lets an editor comment, as themselves", async () => {
    role("EDITOR");
    comments.create.mockResolvedValue({ id: "c1" });
    await createItemComment(actor, "b1", "i1", { body: "nice" });
    expect(comments.create.mock.calls[0][0].data).toEqual({
      itemId: "i1",
      moodboardId: "b1",
      authorId: "u1",
      body: "nice",
    });
  });

  it("will not write on a board in Trash", async () => {
    role("EDITOR", true);
    await expect(
      createItemComment(actor, "b1", "i1", { body: "x" })
    ).rejects.toBeInstanceOf(MoodboardTrashedError);
  });

  it("answers 404 for a reference that is not on this board", async () => {
    role("EDITOR");
    itemFind.mockResolvedValue(null);
    await expect(listItemComments(actor, "b1", "nope")).rejects.toBeInstanceOf(
      MoodboardItemNotFoundError
    );
  });

  it("validates the body", () => {
    expect(createCommentSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(
      createCommentSchema.safeParse({ body: "x".repeat(4001) }).success
    ).toBe(false);
    expect(
      createCommentSchema.safeParse({ body: " hi ", extra: 1 }).success
    ).toBe(false);
    expect(createCommentSchema.parse({ body: " hi " }).body).toBe("hi");
  });

  it("lets only the author, or full access, resolve and delete", async () => {
    comments.findFirst.mockResolvedValue({ id: "c1", authorId: "someone" });
    role("EDITOR");
    await expect(
      setItemCommentResolved(actor, "b1", "i1", "c1", true)
    ).rejects.toBeInstanceOf(MoodboardItemAccessError);
    await expect(
      deleteItemComment(actor, "b1", "i1", "c1")
    ).rejects.toBeInstanceOf(MoodboardItemAccessError);

    comments.findFirst.mockResolvedValue({ id: "c1", authorId: "u1" });
    comments.update.mockResolvedValue({ id: "c1" });
    await setItemCommentResolved(actor, "b1", "i1", "c1", true);
    expect(comments.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(
      Date
    );
    await setItemCommentResolved(actor, "b1", "i1", "c1", false);
    expect(comments.update.mock.calls[1][0].data.resolvedAt).toBeNull();

    role("FULL_ACCESS");
    comments.findFirst.mockResolvedValue({ id: "c1", authorId: "someone" });
    await deleteItemComment(actor, "b1", "i1", "c1");
    expect(comments.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
