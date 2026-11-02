import { EmailService } from "@/lib/email/email-service";
import { isCategoryEnabled } from "@/lib/email/preferences";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { prisma } from "@/lib/prisma";

import { candidateIds } from "../candidates";
import {
  CLAIM_TTL_MINUTES,
  MAX_ATTEMPTS,
  RETRY_AFTER_HOURS,
  existingFor,
  runEmailSweep,
} from "../engine";
import { loadPeople } from "../people";
import { TUESDAY_10_UTC, daysBefore, makePerson } from "./helpers";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    emailSend: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    task: { count: jest.fn() },
    habitCompletion: { count: jest.fn() },
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/email/preferences", () => ({
  isCategoryEnabled: jest.fn(),
  switchOffAllOptional: jest.fn(),
}));
jest.mock("@/lib/email/program-settings", () => ({
  getEmailProgramSettings: jest.fn(),
}));
jest.mock("../candidates", () => ({ candidateIds: jest.fn() }));
jest.mock("../people", () => ({ loadPeople: jest.fn() }));

const NOW = TUESDAY_10_UTC;
const FOOTER = { name: "Example Operator", address: "1 Example Street" };

const row = (patch: Record<string, unknown> = {}) => ({
  id: "r1",
  userId: "user-1",
  ruleKey: "onboard-day2",
  dedupeKey: "",
  status: "deferred",
  deferUntil: null,
  attempts: 0,
  claimedAt: null,
  updatedAt: daysBefore(NOW, 1),
  ...patch,
});

describe("existingFor", () => {
  it("is null without a row", () => {
    expect(existingFor(undefined, NOW)).toBeNull();
  });

  it("keeps a fresh claim and retries a stale one", () => {
    const fresh = new Date(NOW.getTime() - (CLAIM_TTL_MINUTES - 1) * 60_000);
    const stale = new Date(NOW.getTime() - (CLAIM_TTL_MINUTES + 1) * 60_000);
    expect(
      existingFor(row({ status: "claimed", claimedAt: fresh }), NOW)?.status
    ).toBe("claimed");
    expect(
      existingFor(row({ status: "claimed", claimedAt: stale }), NOW)?.status
    ).toBe("retry");
    expect(existingFor(row({ status: "claimed" }), NOW)?.status).toBe("retry");
  });

  it("waits an hour after a failure and gives up after three tries", () => {
    const justNow = new Date(NOW.getTime() - 10 * 60_000);
    const waiting = existingFor(
      row({ status: "failed", attempts: 1, updatedAt: justNow }),
      NOW
    );
    expect(waiting?.status).toBe("deferred");
    expect(waiting?.deferUntil?.getTime()).toBe(
      justNow.getTime() + RETRY_AFTER_HOURS * 3_600_000
    );
    const later = new Date(NOW.getTime() - 2 * 3_600_000);
    expect(
      existingFor(row({ status: "failed", attempts: 1, updatedAt: later }), NOW)
        ?.status
    ).toBe("retry");
    expect(
      existingFor(
        row({ status: "failed", attempts: MAX_ATTEMPTS, updatedAt: later }),
        NOW
      )?.status
    ).toBe("skipped");
  });

  it("passes other statuses through", () => {
    expect(existingFor(row({ status: "sent" }), NOW)?.status).toBe("sent");
    expect(existingFor(row({ status: "deferred" }), NOW)?.status).toBe(
      "deferred"
    );
  });
});

describe("runEmailSweep", () => {
  const sendEmail = jest.mocked(EmailService.sendEmail);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getEmailProgramSettings).mockResolvedValue({
      footer: FOOTER,
      footerMissing: [],
      promoCode: null,
      trackingEndsAt: null,
    } as never);
    jest
      .mocked(candidateIds)
      .mockImplementation(async (key) =>
        key === "onboard-day2" ? ["user-1"] : []
      );
    jest
      .mocked(loadPeople)
      .mockImplementation(
        async () => new Map([["user-1", makePerson()]]) as never
      );
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([]);
    jest
      .mocked(prisma.emailSend.create)
      .mockResolvedValue({ id: "r1" } as never);
    jest.mocked(prisma.emailSend.update).mockResolvedValue({} as never);
    jest.mocked(isCategoryEnabled).mockResolvedValue(true);
    sendEmail.mockResolvedValue({ jobId: "re_1" } as never);
  });

  it("sends a due mail once and records it", async () => {
    const summary = await runEmailSweep({ now: NOW, dryRun: false });
    expect(summary.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({
      to: "alex@example.com",
      commercial: true,
      programme: true,
    });
    expect(mail.unsubscribeUrl).toContain("/api/email/unsubscribe");
    expect(prisma.emailSend.create).toHaveBeenCalledTimes(1);
    expect(prisma.emailSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: "sent", resendId: "re_1" }),
      })
    );
  });

  it("sends nothing and writes a dry row in dry-run mode", async () => {
    const summary = await runEmailSweep({ now: NOW, dryRun: true });
    expect(summary.dry).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.create).not.toHaveBeenCalled();
    expect(prisma.emailSend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "dry",
          reason: "would-send",
        }),
      })
    );
  });

  it("cancels, and does not send, when the category went off after the claim", async () => {
    jest.mocked(isCategoryEnabled).mockResolvedValue(false);
    await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "cancelled",
          reason: "category-off",
        }),
      })
    );
  });

  it("does not send when another worker holds the claim (unique conflict)", async () => {
    jest
      .mocked(prisma.emailSend.create)
      .mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const summary = await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it("marks the row failed when sending throws", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    const summary = await runEmailSweep({ now: NOW, dryRun: false });
    expect(summary.failed).toBe(1);
    expect(prisma.emailSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  it("does not repeat a mail that is already sent", async () => {
    jest
      .mocked(prisma.emailSend.findMany)
      .mockResolvedValue([row({ status: "sent" })] as never);
    await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.create).not.toHaveBeenCalled();
  });

  it("sends no optional mail and leaves no row while the footer is unset", async () => {
    jest.mocked(getEmailProgramSettings).mockResolvedValue({
      footer: null,
      footerMissing: ["name", "address"],
      promoCode: null,
      trackingEndsAt: null,
    } as never);
    const summary = await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.create).not.toHaveBeenCalled();
    expect(prisma.emailSend.upsert).not.toHaveBeenCalled();
    expect(summary.skipped["no-operator"]).toBe(1);
  });

  it("sends no optional mail while the flag is off", async () => {
    jest
      .mocked(loadPeople)
      .mockImplementation(
        async () =>
          new Map([["user-1", makePerson({ flagOn: false })]]) as never
      );
    await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.upsert).not.toHaveBeenCalled();
  });

  it("defers a second optional mail inside the three-day cap", async () => {
    jest
      .mocked(loadPeople)
      .mockImplementation(
        async () =>
          new Map([
            ["user-1", makePerson({ lastMarketingSentAt: daysBefore(NOW, 1) })],
          ]) as never
      );
    const summary = await runEmailSweep({ now: NOW, dryRun: false });
    expect(summary.deferred).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailSend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "deferred", reason: "cap" }),
      })
    );
  });

  it("sends the idempotency key <ledgerId>:<attempt> to Resend", async () => {
    await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("r1:1");
  });

  it("retries a crashed (stale) claim as the same attempt, so the key repeats", async () => {
    const stale = new Date(NOW.getTime() - (CLAIM_TTL_MINUTES + 5) * 60_000);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([
      row({
        id: "r9",
        status: "claimed",
        attempts: 2,
        claimedAt: stale,
      }),
    ] as never);
    jest
      .mocked(prisma.emailSend.updateMany)
      .mockResolvedValue({ count: 1 } as never);
    await runEmailSweep({ now: NOW, dryRun: false });
    const claim = jest.mocked(prisma.emailSend.updateMany).mock.calls[0][0];
    expect(claim.data).not.toHaveProperty("attempts");
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("r9:2");
  });

  it("counts a new attempt after a failure", async () => {
    const earlier = new Date(NOW.getTime() - 3 * 3_600_000);
    jest.mocked(prisma.emailSend.findMany).mockResolvedValue([
      row({
        id: "r8",
        status: "failed",
        attempts: 1,
        updatedAt: earlier,
      }),
    ] as never);
    jest
      .mocked(prisma.emailSend.updateMany)
      .mockResolvedValue({ count: 1 } as never);
    await runEmailSweep({ now: NOW, dryRun: false });
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("r8:2");
  });
});
