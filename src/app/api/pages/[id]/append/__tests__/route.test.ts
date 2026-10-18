import { NextRequest } from "next/server";

import { POST } from "@/app/api/pages/[id]/append/route";
import { appendPageBlocks } from "@/services/pages/page-service";
import { PageCollaborationActiveError } from "@/services/pages/page-write-path";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({
  appendPageBlocks: jest.fn(),
}));

const authenticate = authenticateRequest as jest.Mock;
const access = resolvePageAccess as jest.Mock;
const append = appendPageBlocks as jest.Mock;

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/pages/p1/append", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "p1" }) }
  ) as Promise<Response>;

describe("POST /api/pages/:id/append", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      userId: "u1",
      workspace: { workspaceId: "w1" },
    });
    access.mockResolvedValue(true);
    append.mockResolvedValue({ id: "p1" });
  });

  it("appends the text as blocks", async () => {
    const res = await call({ text: "## From yesterday\n\nCall Anna" });
    expect(res.status).toBe(200);
    const [, id, blocks] = append.mock.calls[0];
    expect(id).toBe("p1");
    expect(blocks.length).toBeGreaterThan(0);
    expect((await res.json()).appendedBlocks).toBe(blocks.length);
  });

  it("refuses an empty text", async () => {
    expect((await call({ text: "   " })).status).toBe(400);
    expect(append).not.toHaveBeenCalled();
  });

  it("refuses a page the caller cannot edit", async () => {
    access.mockResolvedValue(false);
    expect((await call({ text: "x" })).status).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  it("is a 404 when the page is gone", async () => {
    append.mockResolvedValue(null);
    expect((await call({ text: "x" })).status).toBe(404);
  });

  it("is a conflict while the page is edited live", async () => {
    append.mockRejectedValue(new PageCollaborationActiveError());
    expect((await call({ text: "x" })).status).toBe(409);
  });
});
