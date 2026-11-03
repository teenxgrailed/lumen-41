/**
 * @jest-environment jsdom
 *
 * Signing out on the iPhone releases the APNs token. A release that does not
 * reach the server is kept and sent again at the next launch, so a phone that
 * changes hands stops showing the previous account's reminders.
 */
import {
  releaseNativePushToken,
  retryPendingNativeRelease,
} from "@/lib/needt3/hooks/push";

const mockToken = jest.fn<string | null, []>();
jest.mock("@/lib/native", () => ({
  currentNativePushToken: () => mockToken(),
  isIosApp: () => true,
  nativePushPermission: jest.fn(),
  nativePushToken: jest.fn(),
  requestNativePushPermission: jest.fn(),
  unregisterNativePush: jest.fn(),
}));

const KEY = "needt.push.native.release";
const token = "ab".repeat(32);
const fetchMock = jest.fn();

beforeAll(() => {
  // jsdom has no AbortSignal.timeout.
  if (!("timeout" in AbortSignal)) {
    (AbortSignal as unknown as { timeout: () => AbortSignal }).timeout = () =>
      new AbortController().signal;
  }
});

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  mockToken.mockReturnValue(token);
});

describe("releasing the iPhone's push token", () => {
  it("deletes the token and keeps nothing when the server answers", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await releaseNativePushToken();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/push-subscriptions/native?token=${token}`,
      expect.objectContaining({ method: "DELETE" })
    );
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the release when the request fails, and sends it at the next launch", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await releaseNativePushToken();
    expect(localStorage.getItem(KEY)).toBe(token);

    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await retryPendingNativeRelease();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps trying while the server errors", async () => {
    localStorage.setItem(KEY, token);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await retryPendingNativeRelease();
    expect(localStorage.getItem(KEY)).toBe(token);
  });

  it("does nothing without a pending release or a token", async () => {
    mockToken.mockReturnValue(null);
    await releaseNativePushToken();
    await retryPendingNativeRelease();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
