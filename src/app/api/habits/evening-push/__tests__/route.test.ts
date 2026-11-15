import { NextRequest } from "next/server";

import { GET } from "@/app/api/habits/evening-push/route";
import { loadPushTargets } from "@/services/push/targets";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { habitEveningPushEnabled } from "@/lib/feature-flags";
import { eveningSwitchValue } from "@/lib/needt3/hooks/habit-evening";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/feature-flags", () => ({
  habitEveningPushEnabled: jest.fn(),
}));
jest.mock("@/services/push/targets", () => ({ loadPushTargets: jest.fn() }));
// the hook file imports React Query and the settings hooks; the pure helper is
// all this test needs
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSetPref: jest.fn(),
  useSettings: jest.fn(),
}));
jest.mock("@/lib/needt3/hooks/core", () => ({ fetchJson: jest.fn() }));

const auth = authenticateRequest as jest.Mock;
const flag = habitEveningPushEnabled as jest.Mock;
const targets = loadPushTargets as jest.Mock;
const call = () =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/habits/evening-push")
  ).then((r) => r.json());

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1" });
  flag.mockResolvedValue(true);
});

describe("GET /api/habits/evening-push", () => {
  it("says the flag is on and that the account has a device (web or native)", async () => {
    targets.mockResolvedValue([{ id: "t1" }]);
    expect(await call()).toEqual({ enabled: true, hasSubscription: true });
  });

  it("says no device when the account has none", async () => {
    targets.mockResolvedValue([]);
    expect(await call()).toEqual({ enabled: true, hasSubscription: false });
  });

  it("flag off: false, and devices are not even read", async () => {
    flag.mockResolvedValue(false);
    expect(await call()).toEqual({ enabled: false, hasSubscription: false });
    expect(targets).not.toHaveBeenCalled();
  });
});

describe("the switch default", () => {
  it("is the account's subscription, not this device; a stored choice wins", () => {
    expect(eveningSwitchValue({}, true)).toBe(true);
    expect(eveningSwitchValue({}, false)).toBe(false);
    expect(eveningSwitchValue(undefined, false)).toBe(false);
    expect(eveningSwitchValue({ habitEveningPush: false }, true)).toBe(false);
    expect(eveningSwitchValue({ habitEveningPush: true }, false)).toBe(true);
  });
});
