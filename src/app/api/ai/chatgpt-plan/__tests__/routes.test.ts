import { NextRequest } from "next/server";

import { chatGptPlanAvailable } from "@/services/ai/chatgpt-plan/config";
import {
  exchangeChatGptPlanCode,
  revokeChatGptPlanSession,
  safeDecrypt,
  verifyChatGptIdToken,
} from "@/services/ai/chatgpt-plan/oauth";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { GET as callbackRoute } from "../callback/route";
import { DELETE } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    aIOAuthState: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    aIOAuthConnection: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock("@/services/ai/chatgpt-plan/config", () => ({
  CHATGPT_PLAN_MANAGE_USAGE_URL: "https://chatgpt.example/usage",
  chatGptPlanAvailable: jest.fn(),
}));
jest.mock("@/services/ai/chatgpt-plan/oauth", () => ({
  exchangeChatGptPlanCode: jest.fn(),
  hasPlanScope: (scope: string) => scope.includes("chatgpt.tokens.use.direct"),
  nonceFromState: (state: string) => `nonce:${state}`,
  revokeChatGptPlanSession: jest.fn(),
  safeDecrypt: jest.fn(),
  verifyChatGptIdToken: jest.fn(),
}));
jest.mock("@/services/ai/encryption", () => ({
  decryptSecret: () => "verifier",
  encryptSecret: (v: string) => `enc(${v})`,
}));
jest.mock("@/services/ai/oauth", () => ({
  hashOAuthState: (s: string) => `hash(${s})`,
}));

const stateRow = prisma.aIOAuthState as unknown as Record<string, jest.Mock>;
const connection = prisma.aIOAuthConnection as unknown as Record<
  string,
  jest.Mock
>;
const redirectUri = "https://app.needt.app/api/ai/chatgpt-plan/callback";
const config = { clientId: "client" };
const callback = async (request: NextRequest) =>
  (await callbackRoute(request))!;

function hit(query: string) {
  return new NextRequest(
    `https://app.needt.app/api/ai/chatgpt-plan/callback?${query}`
  );
}
const validState = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  userId: "u1",
  provider: "CHATGPT_PLAN",
  redirectUri,
  encryptedCodeVerifier: "enc",
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  (chatGptPlanAvailable as jest.Mock).mockResolvedValue(config);
  stateRow.deleteMany.mockResolvedValue({ count: 1 });
  (revokeChatGptPlanSession as jest.Mock).mockResolvedValue(true);
});

describe("ChatGPT plan callback", () => {
  it("rejects a state that belongs to another user and leaves it alone", async () => {
    stateRow.findUnique.mockResolvedValue(validState({ userId: "someone" }));
    const res = await callback(hit("state=s&code=c"));
    expect(res.status).toBe(400);
    expect(stateRow.delete).not.toHaveBeenCalled();
    expect(stateRow.deleteMany).not.toHaveBeenCalled();
    expect(exchangeChatGptPlanCode).not.toHaveBeenCalled();
  });

  it("rejects a state that was already used", async () => {
    stateRow.findUnique.mockResolvedValue(null);
    const res = await callback(hit("state=s&code=c"));
    expect(res.status).toBe(400);
    expect(exchangeChatGptPlanCode).not.toHaveBeenCalled();
  });

  it("does not exchange the code twice when two requests race on one state", async () => {
    stateRow.findUnique.mockResolvedValue(validState());
    stateRow.deleteMany.mockResolvedValue({ count: 0 });
    const res = await callback(hit("state=s&code=c"));
    expect(location(res).searchParams.get("ai-chatgpt-plan")).toBe("failed");
    expect(exchangeChatGptPlanCode).not.toHaveBeenCalled();
  });

  it("rejects an expired state", async () => {
    stateRow.findUnique.mockResolvedValue(
      validState({ expiresAt: new Date(Date.now() - 1000) })
    );
    const res = await callback(hit("state=s&code=c"));
    expect(res.status).toBe(400);
    expect(stateRow.delete).toHaveBeenCalled();
  });

  it("revokes the issued session and stores nothing when the plan scope is missing", async () => {
    stateRow.findUnique.mockResolvedValue(validState());
    (exchangeChatGptPlanCode as jest.Mock).mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      scope: "openid offline_access",
      idToken: "id",
      expiresAt: new Date(),
    });
    const res = await callback(hit("state=s&code=c"));
    expect(location(res).searchParams.get("ai-chatgpt-plan")).toBe(
      "not_granted"
    );
    expect(revokeChatGptPlanSession).toHaveBeenCalledWith(config, "r");
    expect(connection.upsert).not.toHaveBeenCalled();
    expect(verifyChatGptIdToken).not.toHaveBeenCalled();
  });

  it("revokes the session when the ID token is missing", async () => {
    stateRow.findUnique.mockResolvedValue(validState());
    (exchangeChatGptPlanCode as jest.Mock).mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      scope: "openid chatgpt.tokens.use.direct",
      idToken: null,
      expiresAt: new Date(),
    });
    const res = await callback(hit("state=s&code=c"));
    expect(location(res).searchParams.get("ai-chatgpt-plan")).toBe("failed");
    expect(revokeChatGptPlanSession).toHaveBeenCalledWith(config, "r");
    expect(connection.upsert).not.toHaveBeenCalled();
  });

  it("stores the connection when everything is in order", async () => {
    stateRow.findUnique.mockResolvedValue(validState());
    (exchangeChatGptPlanCode as jest.Mock).mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      scope: "openid offline_access chatgpt.tokens.use.direct",
      idToken: "id",
      expiresAt: new Date(),
    });
    (verifyChatGptIdToken as jest.Mock).mockResolvedValue({
      subject: "sub",
      email: "a@b.c",
    });
    const res = await callback(hit("state=s&code=c"));
    expect(location(res).searchParams.get("ai-chatgpt-plan")).toBe("connected");
    expect(revokeChatGptPlanSession).not.toHaveBeenCalled();
    expect(connection.upsert).toHaveBeenCalled();
  });
});

describe("ChatGPT plan disconnect", () => {
  const del = () =>
    DELETE(
      new NextRequest("https://app.needt.app/api/ai/chatgpt-plan", {
        method: "DELETE",
      })
    );

  it("deletes the row even when the refresh token cannot be decrypted", async () => {
    connection.findUnique.mockResolvedValue({
      encryptedRefreshToken: "corrupt",
    });
    (safeDecrypt as jest.Mock).mockReturnValue(null);
    const res = (await del())!;
    expect(await res.json()).toEqual({
      connected: false,
      remoteRevoked: false,
    });
    expect(revokeChatGptPlanSession).not.toHaveBeenCalled();
    expect(connection.deleteMany).toHaveBeenCalled();
  });

  it("revokes remotely, then deletes", async () => {
    connection.findUnique.mockResolvedValue({ encryptedRefreshToken: "enc" });
    (safeDecrypt as jest.Mock).mockReturnValue("refresh");
    const res = (await del())!;
    expect(await res.json()).toEqual({ connected: false, remoteRevoked: true });
    expect(revokeChatGptPlanSession).toHaveBeenCalledWith(config, "refresh");
    expect(connection.deleteMany).toHaveBeenCalled();
  });
});
