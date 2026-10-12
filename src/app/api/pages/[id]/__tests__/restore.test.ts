import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/pages/[id]/route";
import { updatePage } from "@/services/pages/page-service";
import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({
  getPage: jest.fn(),
  updatePage: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

async function patch(body: unknown): Promise<Response> {
  const response = await PATCH(
    new NextRequest("http://localhost/api/pages/page-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "page-1" }) }
  );
  if (!response) throw new Error("Expected a route response.");
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1", workspace: undefined } as never);
});

describe("PATCH /api/pages/[id] restore", () => {
  it("checks access on the trashed row for { trashed: false }", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue({
      pageId: "page-1",
      role: PageAccessRole.FULL_ACCESS,
    });
    jest.mocked(updatePage).mockResolvedValue({ id: "page-1" } as never);

    const response = await patch({ trashed: false });

    expect(response.status).toBe(200);
    expect(resolvePageAccess).toHaveBeenCalledWith(
      expect.anything(),
      "page-1",
      PageAccessRole.FULL_ACCESS,
      { includeTrashed: true }
    );
    expect(updatePage).toHaveBeenCalledWith(
      expect.anything(),
      "page-1",
      expect.objectContaining({ trashed: false })
    );
  });

  it("keeps trashed rows hidden for every other change", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue(null);

    const response = await patch({ title: "Edit a trashed page" });

    expect(response.status).toBe(403);
    expect(resolvePageAccess).toHaveBeenCalledWith(
      expect.anything(),
      "page-1",
      PageAccessRole.EDITOR,
      { includeTrashed: false }
    );
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("refuses a caller without full access", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue(null);

    const response = await patch({ trashed: false });

    expect(response.status).toBe(403);
    expect(updatePage).not.toHaveBeenCalled();
  });
});
