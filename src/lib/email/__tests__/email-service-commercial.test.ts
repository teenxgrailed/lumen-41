import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";

const mockSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const UNSUBSCRIBE = "https://use.needt.app/api/email/unsubscribe?t=abc";
const base = {
  to: "person@example.com",
  subject: "Your Pro trial ends in 3 days",
  html: "<p>x</p>",
  text: "x",
};

describe("commercial email", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "key";
    process.env.RESEND_FROM_EMAIL = "mail@needt.example";
    delete process.env.OPERATOR_POSTAL_ADDRESS;
    delete process.env.EMAIL_FOOTER_ADDRESS;
    mockSend.mockResolvedValue({ data: { id: "m1" }, error: null });
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      sandboxKind: null,
      commercialEmailsOptOutAt: null,
    } as never);
  });

  afterAll(() => {
    process.env = saved;
  });

  it("is not sent while the postal address is unset", async () => {
    await expect(
      EmailService.sendEmail({
        ...base,
        commercial: true,
        unsubscribeUrl: UNSUBSCRIBE,
      })
    ).resolves.toEqual({ jobId: "" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("is sent with the one-click unsubscribe headers once the address is set", async () => {
    process.env.OPERATOR_POSTAL_ADDRESS = "1 Example Street, Kyiv, Ukraine";
    await expect(
      EmailService.sendEmail({
        ...base,
        commercial: true,
        unsubscribeUrl: UNSUBSCRIBE,
      })
    ).resolves.toEqual({ jobId: "m1" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "List-Unsubscribe": `<${UNSUBSCRIBE}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      })
    );
  });

  it("is dropped for an account that unsubscribed", async () => {
    process.env.OPERATOR_POSTAL_ADDRESS = "1 Example Street, Kyiv, Ukraine";
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      sandboxKind: null,
      commercialEmailsOptOutAt: new Date("2026-10-01T00:00:00.000Z"),
    } as never);
    await expect(
      EmailService.sendEmail({
        ...base,
        commercial: true,
        unsubscribeUrl: UNSUBSCRIBE,
      })
    ).resolves.toEqual({ jobId: "" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a commercial email without an unsubscribe link", async () => {
    process.env.OPERATOR_POSTAL_ADDRESS = "1 Example Street, Kyiv, Ukraine";
    await expect(
      EmailService.sendEmail({ ...base, commercial: true })
    ).rejects.toThrow("unsubscribe");
  });

  it("leaves transactional mail alone: no address needed, no list headers, opt-out ignored", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      sandboxKind: null,
      commercialEmailsOptOutAt: new Date("2026-10-01T00:00:00.000Z"),
    } as never);
    await expect(
      EmailService.sendEmail({ ...base, subject: "Reset your password" })
    ).resolves.toEqual({ jobId: "m1" });
    const sent = mockSend.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.headers).toBeUndefined();
  });

  it("still drops mail to a sandbox account", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      sandboxKind: "reviewer",
      commercialEmailsOptOutAt: null,
    } as never);
    await expect(
      EmailService.sendEmail({ ...base, subject: "Reset your password" })
    ).resolves.toEqual({ jobId: "" });
  });
});
