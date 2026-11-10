import { reauthorizeCollaboration } from "@/collaboration/access-policy";
import { createCollaborationServer } from "@/collaboration/server";
import { Prisma } from "@prisma/client";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/pages/page-write-path", () => ({
  closePageCollaborationSessions: jest.fn(),
  openPageCollaborationSession: jest.fn(),
  storePageCollaborationDocument: jest.fn(),
  touchPageCollaborationSession: jest.fn(),
}));
jest.mock("@/collaboration/access-policy", () => ({
  ...jest.requireActual("@/collaboration/access-policy"),
  reauthorizeCollaboration: jest.fn(),
}));

const reauthorize = reauthorizeCollaboration as jest.Mock;

function payload() {
  return {
    connection: {
      context: { resource: "page", role: "EDITOR" },
      readOnly: false,
    },
    documentName: "page:v2:page-1",
  } as never;
}

function server() {
  return createCollaborationServer({
    useRedis: false,
    authorizationRecheckIntervalMs: 0,
    buildSha: "test",
  });
}

describe("collaboration re-authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps the connection when the database errors", async () => {
    reauthorize.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("pool timeout", {
        code: "P2024",
        clientVersion: "test",
      })
    );
    await expect(
      server().configuration.beforeHandleMessage?.(payload())
    ).resolves.toBeUndefined();
  });

  it("still revokes access on a real denial", async () => {
    reauthorize.mockRejectedValue(
      new Error("Page collaboration access denied")
    );
    await expect(
      server().configuration.beforeHandleMessage?.(payload())
    ).rejects.toMatchObject({ code: 4403 });
  });
});
