import { syncGmail, syncOutlookMail } from "@/lib/mail/providers";
import { MailAccountWithConnection } from "@/lib/mail/types";

jest.mock("imapflow", () => ({ ImapFlow: jest.fn() }));
jest.mock("@/services/ai/encryption", () => ({ decryptSecret: jest.fn() }));
jest.mock("@/lib/token-manager", () => ({
  TokenManager: {
    getInstance: () => ({ getValidAccessToken: async () => "tok" }),
  },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function account(provider: "GMAIL" | "OUTLOOK", syncCursor: string | null) {
  return {
    id: "acc",
    userId: "u",
    provider,
    syncCursor,
    connectionRef: "conn",
    connection: { id: "conn" },
  } as unknown as MailAccountWithConnection;
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

describe("Gmail incremental sync", () => {
  it("skips a message deleted since its history entry and reports it deleted", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        return ok({
          history: [{ id: "11", messages: [{ id: "gone" }, { id: "kept" }] }],
          historyId: "20",
        });
      }
      if (url.includes("/messages/gone")) return fail(404);
      return ok({ id: "kept", historyId: "15", labelIds: ["INBOX"] });
    });
    const result = await syncGmail(account("GMAIL", "10"));
    expect(result.messages.map((m) => m.externalId)).toEqual(["kept"]);
    expect(result.deletedExternalIds).toContain("gone");
    expect(result.cursor).toBe("20");
  });

  it("keeps the cursor at the last entry read when paging stops at the cap", async () => {
    const entries = Array.from({ length: 2_000 }, (_, i) => ({
      id: String(100 + i),
      messages: [{ id: `m${i}` }],
    }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        return ok({
          history: entries,
          historyId: "99999",
          nextPageToken: "more",
        });
      }
      return ok({ id: "x", historyId: "99998", labelIds: ["INBOX"] });
    });
    const result = await syncGmail(account("GMAIL", "10"));
    expect(result.cursor).toBe("2099");
  });

  it("fails the run on a 5xx instead of silently resyncing", async () => {
    fetchMock.mockResolvedValue(fail(503));
    await expect(syncGmail(account("GMAIL", "10"))).rejects.toThrow();
  });

  it("falls back to a full resync when the history id has expired", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) return fail(404);
      if (url.includes("/messages?")) return ok({ messages: [{ id: "a" }] });
      return ok({ id: "a", historyId: "30", labelIds: ["INBOX"] });
    });
    const result = await syncGmail(account("GMAIL", "10"));
    expect(result.messages).toHaveLength(1);
    expect(result.cursor).toBe("30");
  });
});

describe("Outlook mail sync", () => {
  it("stores the next page link as the cursor when the cap stops paging", async () => {
    const page = (n: number) => ({
      value: Array.from({ length: 100 }, (_, i) => ({ id: `${n}-${i}` })),
      "@odata.nextLink": `https://graph.test/next?p=${n + 1}`,
    });
    let n = 0;
    fetchMock.mockImplementation(async () => ok(page(n++)));
    const result = await syncOutlookMail(account("OUTLOOK", null));
    expect(result.cursor).toMatch(/^https:\/\/graph\.test\/next\?p=\d+$/);
  });
});
