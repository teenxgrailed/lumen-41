import { resolvePublicHost } from "@/services/oauth/safe-fetch";

import { pinnedImapOptions } from "@/lib/mail/imap-pinned";

jest.mock("@/services/oauth/safe-fetch", () => ({
  resolvePublicHost: jest.fn(),
}));

const credentials = {
  host: "imap.example.test",
  port: 993,
  secure: true,
  username: "u",
  password: "p",
};

describe("pinnedImapOptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("dials the checked address and keeps TLS on the original name", async () => {
    jest.mocked(resolvePublicHost).mockResolvedValue("203.0.113.7");
    const options = await pinnedImapOptions(credentials);
    expect(options.host).toBe("203.0.113.7");
    expect(options.servername).toBe("imap.example.test");
  });

  it("refuses a host that now resolves to a non-public address", async () => {
    jest
      .mocked(resolvePublicHost)
      .mockRejectedValue(
        new Error("The host resolves to a non-public address.")
      );
    await expect(pinnedImapOptions(credentials)).rejects.toThrow("non-public");
  });

  it("checks an IP literal and leaves it as is", async () => {
    jest.mocked(resolvePublicHost).mockResolvedValue("203.0.113.9");
    const options = await pinnedImapOptions({
      ...credentials,
      host: "203.0.113.9",
    });
    expect(options.host).toBe("203.0.113.9");
    expect(options.servername).toBeUndefined();
  });
});
