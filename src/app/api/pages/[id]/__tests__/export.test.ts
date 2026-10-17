import { NextRequest } from "next/server";

import { GET } from "@/app/api/pages/[id]/export/route";
import { getPage } from "@/services/pages/page-service";
import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({ getPage: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const block = (id: string, position: number, json: unknown) => ({
  id,
  parentBlockId: null,
  type: "PARAGRAPH",
  position,
  createdBy: "HUMAN",
  content: { json },
});

const page = {
  id: "page-1",
  title: "Launch plan",
  blocks: [
    block("b1", 1024, {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Goals" }],
    }),
    block("b2", 2048, {
      type: "paragraph",
      content: [
        { type: "text", text: "Ship ", marks: [] },
        { type: "text", text: "on time", marks: [{ type: "bold" }] },
      ],
    }),
  ],
};

async function get(query = "?format=md", id = "page-1"): Promise<Response> {
  const response = await GET(
    new NextRequest(`http://localhost/api/pages/${id}/export${query}`),
    { params: Promise.resolve({ id }) }
  );
  if (!response) throw new Error("Expected a route response.");
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1", workspace: undefined } as never);
  jest.mocked(resolvePageAccess).mockResolvedValue({
    pageId: "page-1",
    role: PageAccessRole.VIEWER,
  });
  jest.mocked(getPage).mockResolvedValue(page as never);
});

describe("GET /api/pages/[id]/export", () => {
  it("returns the page as a Markdown attachment", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="Launch-plan.md"'
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(
      "# Launch plan\n\n## Goals\n\nShip **on time**\n"
    );
  });

  it("defaults to Markdown when no format is given", async () => {
    const response = await get("");
    expect(response.status).toBe(200);
  });

  it("checks access the way the page GET does", async () => {
    expect(resolvePageAccess).not.toHaveBeenCalled();
    await get();
    // Read access, no write role needed: a viewer can export.
    expect(resolvePageAccess).toHaveBeenCalledWith(expect.anything(), "page-1");
  });

  it("refuses a page the caller cannot read (403) and a missing one (404)", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValueOnce(null as never);
    const denied = await get();
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Page access denied" });
    expect(getPage).not.toHaveBeenCalled();

    jest.mocked(getPage).mockResolvedValueOnce(null as never);
    const missing = await get();
    expect(missing.status).toBe(404);
  });

  it("answers the auth response when the caller is not signed in", async () => {
    const unauthorized = new Response(null, { status: 401 });
    jest
      .mocked(authenticateRequest)
      .mockResolvedValueOnce({ response: unauthorized } as never);
    const response = await get();
    expect(response.status).toBe(401);
    expect(resolvePageAccess).not.toHaveBeenCalled();
  });

  it("says PDF is made in the editor, and refuses unknown formats", async () => {
    const pdf = await get("?format=pdf");
    expect(pdf.status).toBe(400);
    expect((await pdf.json()).error).toMatch(/editor/);
    const odd = await get("?format=docx");
    expect(odd.status).toBe(400);
    expect(resolvePageAccess).not.toHaveBeenCalled();
  });

  it("writes a non-Latin title as an encoded file name", async () => {
    jest
      .mocked(getPage)
      .mockResolvedValueOnce({ ...page, title: "Запуск" } as never);
    const response = await get();
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain(
      "filename*=UTF-8''" + encodeURIComponent("Запуск.md")
    );
    // The plain fallback stays ASCII.
    expect(disposition).toMatch(/filename="[\x20-\x7e]+"/);
  });

  it("exports a page saved with the old Callout atom as a quote", async () => {
    jest.mocked(getPage).mockResolvedValueOnce({
      ...page,
      blocks: [
        block("old", 1024, {
          type: "needtPageBlock",
          attrs: {
            kind: "CALLOUT",
            data: JSON.stringify({ text: "Heads up" }),
          },
        }),
      ],
    } as never);
    expect(await (await get()).text()).toContain("> 💡 Heads up");
  });
});
