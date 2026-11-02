import {
  STUDENT_TOKEN_TTL_MS,
  signStudentToken,
  verifyStudentToken,
} from "@/lib/students/token";

const NOW = Date.UTC(2026, 9, 29, 12);

describe("student email link", () => {
  it("round-trips the account, the address and the purpose", () => {
    const token = signStudentToken(
      { userId: "u1", email: "ana@ethz.ch", purpose: "verify" },
      NOW
    );
    expect(verifyStudentToken(token, NOW + 1000)).toEqual({
      userId: "u1",
      email: "ana@ethz.ch",
      purpose: "verify",
      expiresAt: NOW + STUDENT_TOKEN_TTL_MS.verify,
    });
  });

  it("stops working after its time limit", () => {
    const token = signStudentToken(
      { userId: "u1", email: "ana@ethz.ch", purpose: "verify" },
      NOW
    );
    expect(
      verifyStudentToken(token, NOW + STUDENT_TOKEN_TTL_MS.verify)
    ).toBeNull();
  });

  it("rejects a tampered or foreign token", () => {
    const token = signStudentToken(
      { userId: "u1", email: "ana@ethz.ch", purpose: "recheck" },
      NOW
    );
    const [, sig] = token.split(".");
    const other = signStudentToken(
      { userId: "u2", email: "bob@ethz.ch", purpose: "recheck" },
      NOW
    ).split(".")[0];
    expect(verifyStudentToken(`${other}.${sig}`, NOW)).toBeNull();
    expect(verifyStudentToken(`${token}.x`, NOW)).toBeNull();
    expect(verifyStudentToken("", NOW)).toBeNull();
    expect(verifyStudentToken(null, NOW)).toBeNull();
  });
});
