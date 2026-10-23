import { NextRequest } from "next/server";

import { POST } from "@/app/api/page-templates/[id]/instantiate/route";
import { createPage } from "@/services/pages/page-service";
import { writePageBlocks } from "@/services/pages/page-write-path";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/prisma", () => ({
  prisma: { pageTemplate: { findFirst: jest.fn() } },
}));
jest.mock("@/services/pages/page-service", () => ({
  createPage: jest.fn(),
  updatePage: jest.fn(),
}));
jest.mock("@/services/pages/page-write-path", () => ({
  writePageBlocks: jest.fn(),
}));

const templateModel = prisma.pageTemplate as unknown as {
  findFirst: jest.Mock;
};

const call = (body?: unknown) =>
  POST(
    new NextRequest("http://localhost/api/page-templates/tpl-1/instantiate", {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id: "tpl-1" }) }
  );

describe("Instantiating a page template", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace: {
        enabled: true,
        workspaceId: "workspace-1",
        workspaceKind: "PERSONAL",
        role: WorkspaceRole.OWNER,
        dataScope: { mode: "workspace", workspaceId: "workspace-1" },
      },
    });
    templateModel.findFirst.mockResolvedValue({
      id: "tpl-1",
      name: "Brief",
      snapshot: { title: "Brief", blocks: [] },
    });
    jest.mocked(createPage).mockResolvedValue({ id: "page-1" } as never);
    jest.mocked(writePageBlocks).mockResolvedValue({ id: "page-1" } as never);
  });

  it("makes the page non-private when the request says nothing", async () => {
    const response = await call();
    expect(response!.status).toBe(201);
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPrivate: false })
    );
  });

  it("makes the page non-private for an empty body", async () => {
    await call({});
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPrivate: false })
    );
  });

  it("still makes a Private page when the caller asks for one", async () => {
    await call({ isPrivate: true });
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPrivate: true })
    );
  });

  it("keeps an explicit non-private request non-private", async () => {
    await call({ isPrivate: false });
    expect(createPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPrivate: false })
    );
  });
});
