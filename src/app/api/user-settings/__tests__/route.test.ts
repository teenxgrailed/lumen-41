import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/user-settings/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { PREFS_MAX_BYTES, PREFS_MAX_KEYS } from "@/lib/needt3/prefs-limits";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    userSettings: {
      upsert: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ userId: "u1", prefs: { a: 1 } })),
    },
    // Rows the merge wrote: 1, or 0 when a cap stops it.
    $executeRaw: jest.fn(async () => 1),
  };
  // One transaction: the callback runs against the same client.
  prisma.$transaction = jest.fn(async (run: (tx: unknown) => unknown) =>
    run(prisma)
  );
  return { prisma };
});

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
    // A new row starts empty; the capped merge below fills it.
    expect(args.create.prefs).toEqual({});
    // One `prefs || patch - removed` statement, scoped to the person.
    expect(raw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = raw.mock.calls[0];
    const sql = (strings as string[]).join("?");
    expect(sql).toContain('"prefs" = (COALESCE("prefs", \'{}\'::jsonb) ||');
    expect(sql).toContain(") - ?::text[]");
    // The caps are checked on the merged value, in the same statement.
    expect(sql).toContain("octet_length(");
    expect(sql).toContain("jsonb_object_keys(");
    const patchJson = JSON.stringify({ b: 2 });
    expect(values).toEqual([
      patchJson,
      ["gone"],
      "u1",
      patchJson,
      ["gone"],
      PREFS_MAX_BYTES,
      patchJson,
      ["gone"],
      PREFS_MAX_KEYS,
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The answer is the row as stored after the merge.
    expect(await res.json()).toEqual({ userId: "u1", prefs: { a: 1 } });
  });

  it("leaves prefs alone when a write does not send them", async () => {
    await patch({ theme: "light" });
    expect(raw).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0][0].update).toEqual({ theme: "light" });
  });

  it("a merge past the size or key cap writes nothing and answers 413", async () => {
    raw.mockResolvedValueOnce(0);
    const res = await patch({ theme: "dark", prefs: { big: "x" } });
    expect(res.status).toBe(413);
    // Nothing comes back as saved: the transaction (theme included) failed.
    expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
  });

  it("rejects keys that could reach a prototype", async () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const res = await PATCH(
        new NextRequest("http://localhost/api/user-settings", {
          method: "PATCH",
          body: `{"prefs":{"${key}":{"polluted":true}}}`,
        })
      );
      expect(res!.status).toBe(400);
    }
    expect(raw).not.toHaveBeenCalled();
  });

  it("accepts null for a checked key (removal), still rejects a bad value", async () => {
    expect((await patch({ prefs: { taskView: null } })).status).toBe(200);
    expect((await patch({ prefs: { taskView: "nonsense" } })).status).toBe(400);
  });
});
