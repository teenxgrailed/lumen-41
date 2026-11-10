import { cancelBroadcast } from "../service";

const findUnique = jest.fn();
const updateMany = jest.fn();
const findUniqueOrThrow = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    emailBroadcast: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        emailBroadcast: {
          updateMany: (...a: unknown[]) => updateMany(...a),
          findUniqueOrThrow: (...a: unknown[]) => findUniqueOrThrow(...a),
        },
      }),
  },
}));
jest.mock("@/services/admin/audit", () => ({ recordAdminAudit: jest.fn() }));
jest.mock("@/services/email-lifecycle/people", () => ({
  loadPeople: jest.fn(),
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));

const actor = { id: "a1", kind: "admin" as const };

beforeEach(() => jest.clearAllMocks());

describe("cancelBroadcast", () => {
  it("guards the write on an unfinished status", async () => {
    findUnique.mockResolvedValue({ id: "b1", status: "sending" });
    updateMany.mockResolvedValue({ count: 1 });
    findUniqueOrThrow.mockResolvedValue({ id: "b1", status: "cancelled" });
    await cancelBroadcast(actor, "b1");
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "b1",
      status: { in: ["draft", "scheduled", "sending"] },
    });
  });

  it("does not overwrite a broadcast that finished after it was loaded", async () => {
    findUnique.mockResolvedValue({ id: "b1", status: "sending" });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelBroadcast(actor, "b1")).rejects.toMatchObject({
      status: 409,
    });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
