import { NextRequest } from "next/server";

import * as route from "@/app/api/onboarding/first-replan/route";
import {
  clearFirstReplanDemo,
  firstReplanState,
} from "@/services/onboarding/first-replan-demo";

import { recordActivation } from "@/lib/activation-events";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/services/onboarding/first-replan-demo", () => ({
  clearFirstReplanDemo: jest.fn(),
  firstReplanState: jest.fn(),
}));

type Handler = (r: NextRequest) => Promise<Response>;
const POST = route.POST as unknown as Handler;
const DELETE = route.DELETE as unknown as Handler;

const auth = authenticateRequest as jest.Mock;
const flag = isFeatureEnabled as jest.Mock;
const record = recordActivation as jest.Mock;
const state = firstReplanState as jest.Mock;
const clear = clearFirstReplanDemo as jest.Mock;

const req = (method: string, query = "") =>
  new NextRequest(`http://localhost/api/onboarding/first-replan${query}`, {
    method,
  });

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1" });
  flag.mockResolvedValue(true);
  state.mockResolvedValue({ conflict: true });
  clear.mockResolvedValue(2);
});

describe("POST (card shown)", () => {
  it("records first_replan_card_shown when the flag is on and the demo is there", async () => {
    expect((await POST(req("POST"))).status).toBe(200);
    expect(record).toHaveBeenCalledWith("first_replan_card_shown", "u1");
  });

  it("records nothing with the flag off or without a demo", async () => {
    flag.mockResolvedValue(false);
    await POST(req("POST"));
    flag.mockResolvedValue(true);
    state.mockResolvedValue(null);
    await POST(req("POST"));
    expect(record).not.toHaveBeenCalled();
  });
});

describe("DELETE", () => {
  it("counts Skip (?reason=skip) as first_replan_skipped", async () => {
    await DELETE(req("DELETE", "?reason=skip"));
    expect(record).toHaveBeenCalledWith("first_replan_skipped", "u1");
  });

  it("does not count a plain removal, or a skip that removed nothing", async () => {
    await DELETE(req("DELETE"));
    clear.mockResolvedValue(0);
    await DELETE(req("DELETE", "?reason=skip"));
    expect(record).not.toHaveBeenCalled();
  });
});
