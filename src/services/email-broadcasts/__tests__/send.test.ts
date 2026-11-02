import { CLAIM_TTL_MINUTES } from "@/services/email-lifecycle/engine";
import { loadPeople } from "@/services/email-lifecycle/people";

import { EmailService } from "@/lib/email/email-service";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { prisma } from "@/lib/prisma";

import {
  TUESDAY_10_UTC,
  makePerson,
} from "../../email-lifecycle/__tests__/helpers";
import { sendDueBroadcasts } from "../send";
import { renderBroadcast, resolveRecipientIds } from "../service";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    emailBroadcast: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    emailSend: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/email/program-settings", () => ({
  getEmailProgramSettings: jest.fn(),
}));
jest.mock("@/services/admin/audit", () => ({ recordAdminAudit: jest.fn() }));
jest.mock("@/services/email-lifecycle/people", () => ({
  loadPeople: jest.fn(),
}));
jest.mock("@/services/email-lifecycle/engine", () => ({
  CLAIM_TTL_MINUTES: 15,
  RETRY_AFTER_HOURS: 1,
  dryRunFromEnv: jest.fn(() => false),
}));
jest.mock("../service", () => ({
  BROADCAST_RULE_KEY: "broadcast",
  broadcastDedupeKey: (id: string) => `broadcast:${id}`,
  resolveRecipientIds: jest.fn(),
  renderBroadcast: jest.fn(() => ({
    subject: "Hello",
    html: "<p>hi</p>",
    text: "hi",
  })),
}));

const NOW = TUESDAY_10_UTC;
const FOOTER = { name: "Example Operator", address: "1 Example Street" };
const sendEmail = jest.mocked(EmailService.sendEmail);
let counter = 0;

function broadcastRow(id: string) {
  return {
    id,
    category: "updates",
    segment: "all",
    startedAt: NOW,
    createdBy: "admin-1",
  };
}

const userIds = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

/** Arranges one sending broadcast with the given recipients. */
function arrange(ids: string[], options: { flagOn?: boolean } = {}) {
  counter += 1;
  const id = `b${counter}`;
  jest
    .mocked(prisma.emailBroadcast.findMany)
    .mockImplementation((async (args: { where: { status: string } }) =>
      args.where.status === "sending" ? [broadcastRow(id)] : []) as never);
  jest
    .mocked(prisma.emailBroadcast.updateMany)
    .mockResolvedValue({ count: 1 } as never);
  jest.mocked(resolveRecipientIds).mockResolvedValue(ids);
  jest.mocked(loadPeople).mockImplementation(
    (async (batch: string[]) =>
      new Map(
        batch.map((userId) => [
          userId,
          makePerson({
            userId,
            email: `${userId}@example.com`,
            flagOn: options.flagOn ?? true,
          }),
        ])
      )) as never
  );
  return id;
}

function stillSending(statuses: string[] = []) {
  let call = 0;
  jest
    .mocked(prisma.emailBroadcast.findUnique)
    .mockImplementation((async (args: { select?: unknown }) => {
      if (args.select) {
        const status = statuses[call] ?? "sending";
        call += 1;
        return { status };
      }
      return {
        id: "x",
        subject: "Hello",
        category: "updates",
      };
    }) as never);
}

describe("sendDueBroadcasts", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "nextTick",
        "queueMicrotask",
        "performance",
        "hrtime",
      ],
    });
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as never);
    jest.mocked(getEmailProgramSettings).mockResolvedValue({
      footer: FOOTER,
      footerMissing: [],
      promoCode: null,
      trackingEndsAt: null,
    } as never);
    jest.mocked(renderBroadcast).mockReturnValue({
      subject: "Hello",
      html: "<p>hi</p>",
      text: "hi",
    } as never);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([]);
    jest.mocked(prisma.emailSend.groupBy).mockResolvedValue([] as never);
    jest.mocked(prisma.emailSend.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    jest.mocked(prisma.emailSend.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.emailSend.upsert).mockResolvedValue({} as never);
    jest.mocked(prisma.emailSend.update).mockResolvedValue({} as never);
    jest
      .mocked(prisma.emailSend.create)
      .mockImplementation((async (args: { data: { userId: string } }) => ({
        id: `c-${args.data.userId}`,
      })) as never);
    sendEmail.mockResolvedValue({ jobId: "re_1" } as never);
    stillSending();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("sends once per person with the idempotency key <ledgerId>:<attempt>", async () => {
    arrange(["u0"]);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("c-u0:1");
  });

  it("closes a stale claim as skipped unknown-send and never resends it", async () => {
    arrange(["u0"]);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    const closing = jest
      .mocked(prisma.emailSend.updateMany)
      .mock.calls.map((call) => call[0])
      .find((args) => args.where?.status === "claimed");
    expect(closing).toBeDefined();
    expect(closing?.data).toEqual({
      status: "skipped",
      reason: "unknown-send",
    });
    const cutoff = NOW.getTime() - CLAIM_TTL_MINUTES * 60_000;
    expect(closing?.where?.OR).toEqual([
      { claimedAt: null },
      { claimedAt: { lt: new Date(cutoff) } },
    ]);
  });

  it("finishes the broadcast when a crash left only a closed claim", async () => {
    const id = arrange(["u0"]);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([
      {
        userId: "u0",
        status: "skipped",
        deferUntil: null,
        attempts: 1,
        updatedAt: NOW,
      },
    ] as never);
    jest
      .mocked(prisma.emailSend.groupBy)
      .mockResolvedValue([{ status: "skipped", _count: { _all: 1 } }] as never);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, status: "sending" },
        data: expect.objectContaining({ status: "sent" }),
      })
    );
  });

  it("in dry-run writes dry rows, never calls Resend, and still finishes", async () => {
    const id = arrange(["u0", "u1"]);
    jest
      .mocked(prisma.emailSend.groupBy)
      .mockResolvedValue([{ status: "dry", _count: { _all: 2 } }] as never);
    await sendDueBroadcasts({ now: NOW, dryRun: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.create).not.toHaveBeenCalled();
    const statuses = jest
      .mocked(prisma.emailSend.upsert)
      .mock.calls.map((call) => call[0].create.status);
    expect(statuses).toEqual(["dry", "dry"]);
    expect(prisma.emailBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, status: "sending" },
        data: expect.objectContaining({ status: "sent", sentCount: 0 }),
      })
    );
  });

  it("takes the dry-run default from EMAIL_PROGRAM_DRY_RUN", async () => {
    const { dryRunFromEnv } = jest.requireMock(
      "@/services/email-lifecycle/engine"
    ) as { dryRunFromEnv: jest.Mock };
    dryRunFromEnv.mockReturnValue(true);
    arrange(["u0"]);
    await sendDueBroadcasts({ now: NOW });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops within ten mails when the broadcast is cancelled mid-batch", async () => {
    arrange(userIds(30));
    // 1st check: batch start. 2nd check: after ten mails.
    stillSending(["sending", "cancelled"]);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).toHaveBeenCalledTimes(10);
  });

  it("leaves the broadcast sending, and writes no rows, when the flag went off", async () => {
    const id = arrange(["u0", "u1"], { flagOn: false });
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.upsert).not.toHaveBeenCalled();
    const update = jest
      .mocked(prisma.emailBroadcast.updateMany)
      .mock.calls.map((call) => call[0])
      .find((args) => args.where?.id === id);
    expect(update?.data).not.toHaveProperty("status");
  });

  it("does not retry a failed row again within the hour", async () => {
    arrange(["u0"]);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([
      {
        userId: "u0",
        status: "failed",
        deferUntil: null,
        attempts: 1,
        updatedAt: new Date(NOW.getTime() - 10 * 60_000),
      },
    ] as never);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("retries a failed row after the hour, as attempt 2", async () => {
    arrange(["u0"]);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([
      {
        userId: "u0",
        status: "failed",
        deferUntil: null,
        attempts: 1,
        updatedAt: new Date(NOW.getTime() - 2 * 3_600_000),
      },
    ] as never);
    jest.mocked(prisma.emailSend.findUnique).mockResolvedValue({
      id: "r-u0",
      updatedAt: new Date(NOW.getTime() - 2 * 3_600_000),
      attempts: 1,
    } as never);
    jest
      .mocked(prisma.emailSend.updateMany)
      .mockImplementation((async (args: { where: { id?: string } }) => ({
        count: args.where.id === "r-u0" ? 1 : 0,
      })) as never);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("r-u0:2");
  });

  it("resolves the recipient list once across ticks", async () => {
    arrange(["u0"]);
    // Nothing is finished, so the broadcast stays in the sending list.
    jest
      .mocked(prisma.emailSend.groupBy)
      .mockResolvedValue([
        { status: "deferred", _count: { _all: 1 } },
      ] as never);
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    await sendDueBroadcasts({ now: NOW, dryRun: false });
    expect(resolveRecipientIds).toHaveBeenCalledTimes(1);
  });
});
