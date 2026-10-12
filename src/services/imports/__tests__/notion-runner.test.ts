import { prisma } from "@/lib/prisma";

import { NotionApiError } from "../notion/client";
import { runNotionImport } from "../notion/importer";
import { processImportRun, sweepStuckImportRuns } from "../runner";
import { ImportCancelledError } from "../types";
import { fakeNotion } from "./fixtures/notion/workspace";
import { createMemoryDb } from "./memory-store";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    importRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/imports/token-secret", () => ({
  openImportToken: (value: string | null) =>
    value === "enc:token"
      ? "ntn_access"
      : value === "enc:envelope"
        ? JSON.stringify({ a: "ntn_access2", r: "nrt_refresh" })
        : null,
}));

interface RunRow {
  id: string;
  userId: string;
  workspaceId: string;
  source: "notion";
  status: string;
  encryptedToken: string | null;
  counts?: unknown;
  warnings?: unknown[];
}

function fakeRunTable(initial: RunRow) {
  const row: RunRow = { ...initial };
  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "id") return v === row.id;
      if (k === "status") return v === row.status;
      if (k === "encryptedToken")
        return (v as { not: null }).not === null && row.encryptedToken !== null;
      return true;
    });
  const apply = (data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (k === "warnings") {
        const op = v as { set?: unknown[]; push?: unknown };
        row.warnings = op.set ?? [...(row.warnings ?? []), op.push];
      } else (row as unknown as Record<string, unknown>)[k] = v;
    }
  };
  jest
    .mocked(prisma.importRun.findUnique)
    .mockImplementation((async () => ({ ...row })) as never);
  jest.mocked(prisma.importRun.updateMany).mockImplementation((async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    if (!matches(args.where)) return { count: 0 };
    apply(args.data);
    return { count: 1 };
  }) as never);
  jest.mocked(prisma.importRun.update).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    apply(args.data);
    return { ...row };
  }) as never);
  return row;
}

const baseRun: RunRow = {
  id: "run-n",
  userId: "user-1",
  workspaceId: "ws-1",
  source: "notion",
  status: "queued",
  encryptedToken: "enc:token",
};

const unusedTodoist = {
  fetchTodoistSnapshot: jest.fn(),
  createStore: jest.fn(),
  createGuard: jest.fn(),
  loadUserTimeZone: jest.fn(),
};

describe("processImportRun for Notion", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs the whole import over the fixtures, marks the run done and wipes the token", async () => {
    const row = fakeRunTable(baseRun);
    const db = createMemoryDb();
    const tokensSeen: unknown[] = [];
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: async (input) => {
        tokensSeen.push(input.tokens);
        return runNotionImport({
          source: fakeNotion(),
          store: db.notionStoreFor(input.workspaceId),
          guard: { allowCreate: async () => ({ allowed: true }) },
          hooks: input.hooks,
          download: async (url) => ({
            bytes: Buffer.from("x"),
            contentType: "image/png",
            finalUrl: url,
          }),
        });
      },
    });
    expect(tokensSeen).toEqual([
      { accessToken: "ntn_access", refreshToken: null },
    ]);
    expect(row.status).toBe("done");
    expect(row.encryptedToken).toBeNull();
    expect(row.counts).toEqual({ total: 7, done: 7, skipped: 0, failed: 0 });
    expect((row.warnings ?? []).length).toBeGreaterThan(0);
    expect(db.pages.size).toBe(7);
    expect(unusedTodoist.fetchTodoistSnapshot).not.toHaveBeenCalled();
  });

  it("hands a stored refresh token to the import", async () => {
    fakeRunTable({ ...baseRun, encryptedToken: "enc:envelope" });
    const seen: unknown[] = [];
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: async (input) => {
        seen.push(input.tokens);
        return {
          counts: { total: 0, done: 0, skipped: 0, failed: 0 },
          warnings: [],
        };
      },
    });
    expect(seen).toEqual([
      { accessToken: "ntn_access2", refreshToken: "nrt_refresh" },
    ]);
  });

  it("fails the run with Notion's reason and still wipes the token", async () => {
    const row = fakeRunTable(baseRun);
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: async () => {
        throw new NotionApiError(
          "unauthorized",
          "Notion did not accept the access. Connect again and retry.",
          401
        );
      },
    });
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect(row.warnings).toEqual([
      {
        code: "notion_unauthorized",
        message: "Notion did not accept the access. Connect again and retry.",
      },
    ]);
  });

  it("fails an unexpected error generically, keeps its detail out of the report, and wipes the token", async () => {
    const row = fakeRunTable(baseRun);
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: async () => {
        throw new Error("SECRET internals ntn_access");
      },
    });
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect(JSON.stringify(row.warnings)).not.toContain("SECRET");
    expect(JSON.stringify(row.warnings)).toContain("import_failed");
  });

  it("wipes the token when the import is cancelled", async () => {
    const row = fakeRunTable(baseRun);
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: async () => {
        throw new ImportCancelledError();
      },
    });
    expect(row.encryptedToken).toBeNull();
  });

  it("fails as unauthorized when the stored token cannot be read", async () => {
    const row = fakeRunTable({ ...baseRun, encryptedToken: "garbage" });
    const runNotion = jest.fn();
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: runNotion,
    });
    expect(runNotion).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect((row.warnings as { code: string }[])[0].code).toBe(
      "notion_unauthorized"
    );
  });

  it("wipes the token of a run cancelled before the worker got to it", async () => {
    const row = fakeRunTable({ ...baseRun, status: "cancelled" });
    const runNotion = jest.fn();
    await processImportRun("run-n", {
      ...unusedTodoist,
      runNotionImport: runNotion,
    });
    expect(runNotion).not.toHaveBeenCalled();
    expect(row.encryptedToken).toBeNull();
  });

  it("is swept like any other source when its worker dies", async () => {
    jest.mocked(prisma.importRun.updateMany).mockResolvedValue({ count: 1 });
    await expect(sweepStuckImportRuns()).resolves.toBe(1);
    const args = jest.mocked(prisma.importRun.updateMany).mock.calls[0][0];
    expect(JSON.stringify(args?.where)).not.toContain("source");
    expect(args?.data).toMatchObject({
      status: "failed",
      encryptedToken: null,
    });
  });
});
