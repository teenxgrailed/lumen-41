import { syncBugReportToGithub } from "../bug-report-service";

const findMany = jest.fn();
const update = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueBugReportSync: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    bugReport: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: jest.fn(),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const report = (id: string) => ({
  id,
  title: id,
  description: "d",
  githubIssueUrl: null,
  severity: "MEDIUM",
});

describe("syncBugReportToGithub sweep", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_BUG_REPORT_TOKEN = "test-token";
    process.env.GITHUB_BUG_REPORT_REPO = "owner/private-repo";
    update.mockResolvedValue({});
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("syncs the reports behind one that GitHub keeps rejecting", async () => {
    findMany.mockResolvedValue([report("bad"), report("good")]);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 422 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html_url: "https://github.com/o/r/issues/1" }),
      }) as unknown as typeof fetch;

    await expect(syncBugReportToGithub()).rejects.toThrow(
      "GitHub returned 422"
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: "good" },
      data: {
        githubIssueUrl: "https://github.com/o/r/issues/1",
        githubSyncError: null,
      },
    });
  });
});
