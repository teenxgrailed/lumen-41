import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/pages/[id]/route";
import { deletePageForever, updatePage } from "@/services/pages/page-service";
import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({
  getPage: jest.fn(),
  updatePage: jest.fn(),
  deletePageForever: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

async function del(query = ""): Promise<Response> {
  const response = await DELETE(
    new NextRequest(`http://localhost/api/pages/page-1${query}`, {
      method: "DELETE",
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

describe("DELETE /api/pages/[id]", () => {
  it("still only moves the page to Trash without ?permanent", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue({
      pageId: "page-1",
      role: PageAccessRole.FULL_ACCESS,
    });
    jest.mocked(updatePage).mockResolvedValue({ id: "page-1" } as never);

    const response = await del();

    expect(response.status).toBe(200);
    expect(updatePage).toHaveBeenCalledWith(expect.anything(), "page-1", {
      trashed: true,
    });
    expect(deletePageForever).not.toHaveBeenCalled();
  });

  it("?permanent=true deletes a page that is in Trash for good", async () => {
    jest.mocked(deletePageForever).mockResolvedValue("deleted");

    const response = await del("?permanent=true");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(deletePageForever).toHaveBeenCalledWith(expect.anything(), "page-1");
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("refuses a page that is not in Trash (409) and one the caller cannot delete (404)", async () => {
    jest.mocked(deletePageForever).mockResolvedValueOnce("not-trashed");
    const live = await del("?permanent=true");
    expect(live.status).toBe(409);

    jest.mocked(deletePageForever).mockResolvedValueOnce("not-found");
    const missing = await del("?permanent=true");
    expect(missing.status).toBe(404);
  });

  it("anything but ?permanent=true is the ordinary Trash move", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue(null);

    const response = await del("?permanent=1");

    expect(response.status).toBe(403);
    expect(deletePageForever).not.toHaveBeenCalled();
  });
});
