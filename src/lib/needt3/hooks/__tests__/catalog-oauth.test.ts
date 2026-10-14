/**
 * @jest-environment jsdom
 */
import { startOAuth } from "../catalog";

const assign = jest.fn();
const fetchMock = jest.fn();

beforeEach(() => {
  assign.mockReset();
  fetchMock.mockReset();
  Object.assign(globalThis, { fetch: fetchMock });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
});

describe("startOAuth", () => {
  it("goes to the provider when the start answers with a redirect", async () => {
    fetchMock.mockResolvedValueOnce({ type: "opaqueredirect", status: 0 });
    await expect(startOAuth("/api/calendar/google/auth")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/calendar/google/auth",
      expect.objectContaining({ redirect: "manual" })
    );
    expect(assign).toHaveBeenCalledWith("/api/calendar/google/auth");
  });

  it("shows the refusal instead of painting a JSON page", async () => {
    fetchMock.mockResolvedValueOnce({
      type: "basic",
      status: 403,
      json: async () => ({ error: "Mailbox limit reached." }),
    });
    await expect(startOAuth("/api/mail/oauth/google/auth")).resolves.toEqual({
      ok: false,
      error: "Mailbox limit reached.",
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("lets the browser try when the check itself cannot run", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await startOAuth("/api/mail/oauth/outlook/auth");
    expect(assign).toHaveBeenCalledWith("/api/mail/oauth/outlook/auth");
  });
});
