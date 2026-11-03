import { GET } from "@/app/api/health/route";

import { handleShutdownSignal, resetDrainStateForTests } from "@/lib/drain";
import { getMigrationStatus } from "@/lib/health/migrations";
import { readWorkerReleaseBuildSha } from "@/lib/health/worker-release";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/health/migrations", () => ({
  getMigrationStatus: jest.fn(),
}));
jest.mock("@/lib/health/worker-release", () => ({
  readWorkerReleaseBuildSha: jest.fn(),
}));

const mockGetMigrationStatus = jest.mocked(getMigrationStatus);
const mockReadWorkerReleaseBuildSha = jest.mocked(readWorkerReleaseBuildSha);
const TEST_SHA = "a".repeat(40);

describe("GET /api/health", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "test",
    });
    process.env.NEEDT_BUILD_SHA = TEST_SHA;
    mockReadWorkerReleaseBuildSha.mockResolvedValue(null);
  });

  afterAll(() => {
    delete process.env.NEEDT_BUILD_SHA;
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
  });

  it("reports a healthy database when every packaged migration succeeded", async () => {
    mockGetMigrationStatus.mockResolvedValue({ pending: [] });

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      db: "ok",
      buildSha: TEST_SHA,
      workerBuildSha: null,
    });
  });

  it("reports a matching private worker heartbeat without gating web health", async () => {
    mockGetMigrationStatus.mockResolvedValue({ pending: [] });
    mockReadWorkerReleaseBuildSha.mockResolvedValue(TEST_SHA);

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      buildSha: TEST_SHA,
      workerBuildSha: TEST_SHA,
    });
  });

  it("fails before dependency checks when production has no Git SHA", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "production",
    });
    process.env.NEEDT_BUILD_SHA = "local";

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      db: "unchecked",
      buildSha: "local",
      workerBuildSha: null,
    });
    expect(mockGetMigrationStatus).not.toHaveBeenCalled();
    expect(mockReadWorkerReleaseBuildSha).not.toHaveBeenCalled();
  });

  it("fails closed without exposing pending migration names", async () => {
    mockGetMigrationStatus.mockResolvedValue({
      pending: ["20260823000000_internal_migration"],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      db: "migrations-pending",
      buildSha: TEST_SHA,
    });
    expect(body).not.toHaveProperty("pending");
    expect(JSON.stringify(body)).not.toContain("internal_migration");
  });

  it("fails closed without exposing a database exception", async () => {
    mockGetMigrationStatus.mockRejectedValue(
      new Error("password=not-for-health-output")
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      db: "error",
      buildSha: TEST_SHA,
    });
    expect(JSON.stringify(body)).not.toContain("password=");
  });

  it("returns 503 with draining:true while the process is shutting down", async () => {
    jest.useFakeTimers();
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    try {
      handleShutdownSignal("SIGTERM");

      const response = await GET();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        draining: true,
      });
      expect(mockGetMigrationStatus).not.toHaveBeenCalled();
    } finally {
      resetDrainStateForTests();
      exitSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
