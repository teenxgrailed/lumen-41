import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

import { GET, POST } from "../route";

jest.mock("@/services/account/account-export", () => ({
  hashAccountExportToken: (t: string) => `hash:${t}`,
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

describe("account export download", () => {
  beforeEach(() => jest.clearAllMocks());

  it("GET only shows a confirm page and never touches the database", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/account/export/download?token=abc")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("escapes the token in the confirm page", async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost/api/account/export/download?token="><script>'
      )
    );
    expect(await res.text()).not.toContain("<script>");
  });

  it("POST consumes the token and returns the archive", async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue(Buffer.from("zip"));
    const body = new URLSearchParams({ token: "abc" });
    const res = await POST(
      new NextRequest("http://localhost/api/account/export/download", {
        method: "POST",
        body,
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
