import { NextRequest } from "next/server";

import { GET } from "@/app/api/pages/route";
import { listPages } from "@/services/pages/page-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/pages/page-service", () => ({
  createPage: jest.fn(),
  listPages: jest.fn(),
}));

const authenticate = authenticateRequest as jest.Mock;
const list = listPages as jest.Mock;

const get = async (query = "") => {
  const res = await GET(new NextRequest(`http://localhost/api/pages${query}`));
  if (!res) throw new Error("The route returned no response");
  return res;
};

describe("GET /api/pages preview", () => {
  beforeEach(() => {
    list.mockReset();
    authenticate.mockResolvedValue({ userId: "me" });
  });

  it("asks for the preview by default and returns it on each page", async () => {
    list.mockResolvedValue([
      { id: "a", title: "A", preview: [{ type: "p", text: "Hello" }] },
    ]);

    const res = await get();

    expect(list.mock.calls[0][1]).toMatchObject({ preview: true });
    await expect(res.json()).resolves.toEqual({
      pages: [{ id: "a", title: "A", preview: [{ type: "p", text: "Hello" }] }],
    });
  });

  it("leaves it out for ?preview=false and keeps the other filters", async () => {
    list.mockResolvedValue([]);

    await get("?preview=false&favorites=true&q=plan");

    expect(list.mock.calls[0][1]).toMatchObject({
      preview: false,
      favorites: true,
      search: "plan",
      trashed: false,
    });
  });

  it("lists as the signed-in person and answers a refusal as before", async () => {
    list.mockResolvedValue([]);
    await get();
    expect(list.mock.calls[0][0]).toEqual({ userId: "me" });

    authenticate.mockResolvedValue({
      response: new Response("no", { status: 401 }),
    });
    const res = await get();
    expect(res.status).toBe(401);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
