import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MINUTES,
  checkEmailCode,
  cleanEmailCode,
  consumeEmailCode,
  generateEmailCode,
  hashEmailCode,
  issueEmailCode,
} from "@/lib/auth/email-code";

interface Row {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

/* A tiny in-memory stand-in for the one table these functions touch. */
const rows: Row[] = [];
let nextId = 1;

type Where = {
  id?: string;
  email?: string;
  consumedAt?: null;
  expiresAt?: { gt?: Date; lt?: Date };
  attempts?: { lt?: number; gt?: number; gte?: number };
  OR?: Where[];
};
function matches(row: Row, where: Where): boolean {
  if (where.OR) return where.OR.some((w) => matches(row, w));
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.email !== undefined && row.email !== where.email) return false;
  if (where.consumedAt === null && row.consumedAt !== null) return false;
  const e = where.expiresAt;
  if (e?.gt && !(row.expiresAt > e.gt)) return false;
  if (e?.lt && !(row.expiresAt < e.lt)) return false;
  const a = where.attempts;
  if (a?.lt !== undefined && !(row.attempts < a.lt)) return false;
  if (a?.gt !== undefined && !(row.attempts > a.gt)) return false;
  if (a?.gte !== undefined && !(row.attempts >= a.gte)) return false;
  return true;
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    emailLoginCode: {
      deleteMany: async ({ where }: { where: Where }) => {
        const keep = rows.filter((r) => !matches(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      },
      create: async ({
        data,
      }: {
        data: Pick<Row, "email" | "codeHash" | "expiresAt">;
      }) => {
        const row: Row = {
          id: `c${nextId++}`,
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(Date.now() + nextId),
          ...data,
        };
        rows.push(row);
        return { id: row.id };
      },
      findFirst: async ({ where }: { where: Where }) =>
        [...rows].reverse().find((r) => matches(r, where)) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Where;
        data: {
          attempts?: { increment?: number; decrement?: number };
          consumedAt?: Date;
        };
      }) => {
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) {
          if (data.attempts?.increment) r.attempts += data.attempts.increment;
          if (data.attempts?.decrement) r.attempts -= data.attempts.decrement;
          if (data.consumedAt) r.consumedAt = data.consumedAt;
        }
        return { count: hit.length };
      },
    },
  },
}));

const EMAIL = "person@example.com";
const NOW = new Date("2026-11-14T10:00:00Z");

beforeEach(() => {
  rows.length = 0;
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("generateEmailCode", () => {
  it("is always six digits, zero padded", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(generateEmailCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("cleanEmailCode", () => {
  it("accepts six digits with the spaces and dashes of a paste", () => {
    expect(cleanEmailCode("123456")).toBe("123456");
    expect(cleanEmailCode(" 123 456 ")).toBe("123456");
    expect(cleanEmailCode("123-456")).toBe("123456");
  });
  it("refuses anything else", () => {
    expect(cleanEmailCode("12345")).toBeNull();
    expect(cleanEmailCode("1234567")).toBeNull();
    expect(cleanEmailCode("12345a")).toBeNull();
    expect(cleanEmailCode(123456)).toBeNull();
  });
});

describe("hashEmailCode", () => {
  it("is an HMAC bound to the address, never the code itself", () => {
    const hash = hashEmailCode(EMAIL, "123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(hashEmailCode("Person@Example.com ", "123456")).toBe(hash);
    expect(hashEmailCode("other@example.com", "123456")).not.toBe(hash);
    process.env.NEXTAUTH_SECRET = "another-secret";
    expect(hashEmailCode(EMAIL, "123456")).not.toBe(hash);
  });
});

describe("issueEmailCode", () => {
  it("stores only the hash and expires in ten minutes", async () => {
    const { code, expiresAt } = await issueEmailCode(EMAIL, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(hashEmailCode(EMAIL, code));
    expect(JSON.stringify(rows[0])).not.toContain(`"${code}"`);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(
      EMAIL_CODE_TTL_MINUTES * 60_000
    );
  });

  it("ends the older code of the same address and sweeps expired ones", async () => {
    const first = await issueEmailCode(EMAIL, NOW);
    await issueEmailCode("old@example.com", new Date("2026-11-14T08:00:00Z"));
    const second = await issueEmailCode(EMAIL, NOW);
    expect(rows.map((r) => r.email)).toEqual([EMAIL]);
    expect(rows[0].codeHash).toBe(hashEmailCode(EMAIL, second.code));
    expect(rows[0].codeHash === hashEmailCode(EMAIL, first.code)).toBe(
      first.code === second.code
    );
  });
});

describe("checkEmailCode", () => {
  it("accepts the right code and does not spend it", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    const checked = await checkEmailCode(EMAIL, code, NOW);
    expect(checked.status).toBe("ok");
    expect(rows[0].consumedAt).toBeNull();
    expect(rows[0].attempts).toBe(0);
  });

  it("refuses a wrong code and counts the try", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    const wrong = code === "000000" ? "000001" : "000000";
    expect((await checkEmailCode(EMAIL, wrong, NOW)).status).toBe("wrong");
    expect(rows[0].attempts).toBe(1);
  });

  it("kills the code after five wrong tries, even for the right code", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < EMAIL_CODE_MAX_ATTEMPTS; i += 1) {
      expect((await checkEmailCode(EMAIL, wrong, NOW)).status).toBe("wrong");
    }
    expect(rows).toHaveLength(0);
    expect((await checkEmailCode(EMAIL, code, NOW)).status).toBe("invalid");
  });

  it("does not count past the cap when the row is still there", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    rows[0].attempts = EMAIL_CODE_MAX_ATTEMPTS;
    expect((await checkEmailCode(EMAIL, code, NOW)).status).toBe("invalid");
    expect(rows[0].attempts).toBe(EMAIL_CODE_MAX_ATTEMPTS);
  });

  it("refuses an expired code", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect((await checkEmailCode(EMAIL, code, later)).status).toBe("invalid");
  });

  it("refuses the code of another address", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    expect(
      (await checkEmailCode("someone@example.com", code, NOW)).status
    ).toBe("invalid");
  });
});

describe("consumeEmailCode", () => {
  it("works once", async () => {
    const { code } = await issueEmailCode(EMAIL, NOW);
    const checked = await checkEmailCode(EMAIL, code, NOW);
    if (checked.status !== "ok") throw new Error("expected ok");
    expect(await consumeEmailCode(checked.id, NOW)).toBe(true);
    expect(await consumeEmailCode(checked.id, NOW)).toBe(false);
    expect((await checkEmailCode(EMAIL, code, NOW)).status).toBe("invalid");
  });
});
