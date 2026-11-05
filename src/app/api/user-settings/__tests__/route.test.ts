import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/user-settings/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: {
      upsert: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ userId: "u1", prefs: { a: 1 } })),
    },
    $executeRaw: jest.fn(async () => 1),
  },
}));

const upsert = prisma.userSettings.upsert as jest.Mock;
const raw = prisma.$executeRaw as unknown as jest.Mock;

const patch = async (body: unknown) =>
  (await PATCH(
    new NextRequest("http://localhost/api/user-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  ))!;

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
});

describe("PATCH /api/user-settings prefs", () => {
  it("never replaces the stored map: prefs is merged by Postgres in one statement", async () => {
    const res = await patch({ theme: "dark", prefs: { b: 2, gone: null } });
    expect(res.status).toBe(200);
    // The plain update carries every field but prefs.
    const args = upsert.mock.calls[0][0];
    expect(args.update).toEqual({ theme: "dark" });
    expect(args.create.prefs).toEqual({ b: 2 });
    // One `prefs || patch - removed` statement, scoped to the person.
    expect(raw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = raw.mock.calls[0];
    const sql = (strings as string[]).join("?");
    expect(sql).toContain('"prefs" = (COALESCE("prefs", \'{}\'::jsonb) ||');
    expect(sql).toContain(") - ?::text[]");
    expect(values).toEqual([JSON.stringify({ b: 2 }), ["gone"], "u1"]);
    // The answer is the row as stored after the merge.
    expect(await res.json()).toEqual({ userId: "u1", prefs: { a: 1 } });
  });

  it("leaves prefs alone when a write does not send them", async () => {
    await patch({ theme: "light" });
    expect(raw).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0][0].update).toEqual({ theme: "light" });
  });

  it("accepts null for a checked key (removal), still rejects a bad value", async () => {
    expect((await patch({ prefs: { taskView: null } })).status).toBe(200);
    expect((await patch({ prefs: { taskView: "nonsense" } })).status).toBe(400);
  });
});
