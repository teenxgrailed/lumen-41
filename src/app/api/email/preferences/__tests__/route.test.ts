import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/email/preferences/route";

import {
  getPreferences,
  recordKeep,
  setCategory,
  setFewerEmails,
  switchOffAllOptional,
} from "@/lib/email/preferences";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe";

jest.mock("@/lib/security/rate-limit", () => ({
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/email/preferences", () => ({
  getPreferences: jest.fn(),
  recordKeep: jest.fn(),
  setCategory: jest.fn(),
  setFewerEmails: jest.fn(),
  switchOffAllOptional: jest.fn(),
}));

const url = (token: string | null, extra = "") =>
  `http://localhost/api/email/preferences?${extra}${token ? `t=${token}` : ""}`;

function post(token: string | null, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new NextRequest(url(token), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("email preference page", () => {
  const token = signUnsubscribeToken("u1", "all");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPreferences).mockResolvedValue({
      categories: { tips: true, offers: true, updates: false, recap: false },
      fewer: false,
      paused: false,
    });
  });

  it("GET only draws the form and changes nothing", async () => {
    const response = await GET(new NextRequest(url(token)));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain('name="tips" checked');
    expect(html).not.toContain('name="updates" checked');
    expect(setCategory).not.toHaveBeenCalled();
    expect(switchOffAllOptional).not.toHaveBeenCalled();
    expect(recordKeep).not.toHaveBeenCalled();
  });

  it("GET with keep=1 offers the keep button but still changes nothing", async () => {
    const response = await GET(new NextRequest(url(token, "keep=1&")));
    expect(await response.text()).toContain('value="keep"');
    expect(recordKeep).not.toHaveBeenCalled();
  });

  it("a bad or missing token gets a 400 and nothing changes", async () => {
    expect((await GET(new NextRequest(url("garbage")))).status).toBe(400);
    expect((await GET(new NextRequest(url(null)))).status).toBe(400);
    expect((await POST(post("garbage", { action: "stop" }))).status).toBe(400);
    expect(switchOffAllOptional).not.toHaveBeenCalled();
  });

  it("POST stop switches every optional category off", async () => {
    const response = await POST(post(token, { action: "stop" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("You are unsubscribed");
    expect(switchOffAllOptional).toHaveBeenCalledWith("u1", "unsubscribe-link");
  });

  it("POST keep records the answer to the quarterly question", async () => {
    const response = await POST(post(token, { action: "keep" }));
    expect(response.status).toBe(200);
    expect(recordKeep).toHaveBeenCalledWith("u1");
    expect(switchOffAllOptional).not.toHaveBeenCalled();
  });

  it("POST save sets each category from the checkboxes", async () => {
    await POST(post(token, { action: "save", tips: "on", fewer: "on" }));
    expect(setCategory).toHaveBeenCalledWith("u1", "tips", true, "settings");
    expect(setCategory).toHaveBeenCalledWith("u1", "offers", false, "settings");
    expect(setCategory).toHaveBeenCalledWith(
      "u1",
      "updates",
      false,
      "settings"
    );
    expect(setCategory).toHaveBeenCalledWith("u1", "recap", false, "settings");
    expect(setFewerEmails).toHaveBeenCalledWith("u1", true);
  });
});
