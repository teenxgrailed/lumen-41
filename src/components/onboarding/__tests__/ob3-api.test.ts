import { registerEmail } from "../ob3-api";

jest.mock("@/lib/needt3/locale-defaults", () => ({
  browserLocale: () => ({ timeZone: "Europe/Berlin", locale: "de-DE" }),
}));

describe("registerEmail", () => {
  it("sends the browser's zone and language with the sign-up", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    await registerEmail("ana@x.ch", "12345678", "Ana", true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toBe("/api/auth/register");
    expect(JSON.parse(init.body)).toEqual({
      email: "ana@x.ch",
      password: "12345678",
      ageConfirmed: true,
      name: "Ana",
      timeZone: "Europe/Berlin",
      locale: "de-DE",
    });
  });
});
