import {
  imapConnectionOptions,
  imapTlsProblem,
  isImapTlsFailure,
} from "@/lib/mail/imap-tls";

const credentials = {
  host: "imap.example.com",
  port: 993,
  secure: true,
  username: "me",
  password: "secret",
};

describe("imapConnectionOptions", () => {
  it("uses implicit TLS when secure is on", () => {
    const options = imapConnectionOptions(credentials);
    expect(options.secure).toBe(true);
    expect(options).not.toHaveProperty("doSTARTTLS");
  });

  it("requires STARTTLS whenever secure is off, on any port", () => {
    for (const port of [143, 1143]) {
      expect(
        imapConnectionOptions({ ...credentials, port, secure: false })
      ).toMatchObject({ secure: false, doSTARTTLS: true });
    }
  });
});

describe("imapTlsProblem", () => {
  it("accepts the standard pairs and unknown ports", () => {
    expect(imapTlsProblem({ port: 993, secure: true })).toBeNull();
    expect(imapTlsProblem({ port: 143, secure: false })).toBeNull();
    expect(imapTlsProblem({ port: 1993, secure: true })).toBeNull();
    expect(imapTlsProblem({ port: 1143, secure: false })).toBeNull();
  });

  it("rejects 993 without TLS and 143 with implicit TLS", () => {
    expect(imapTlsProblem({ port: 993, secure: false })).toMatch(/993/);
    expect(imapTlsProblem({ port: 143, secure: true })).toMatch(/143/);
  });
});

describe("isImapTlsFailure", () => {
  it("recognises imapflow's tlsFailed marker only", () => {
    const tls = Object.assign(new Error("no STARTTLS"), { tlsFailed: true });
    expect(isImapTlsFailure(tls)).toBe(true);
    expect(isImapTlsFailure(new Error("ECONNREFUSED"))).toBe(false);
    expect(isImapTlsFailure(null)).toBe(false);
  });
});
