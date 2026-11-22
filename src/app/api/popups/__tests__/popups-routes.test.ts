import { NextRequest, NextResponse } from "next/server";

import { getNextPopup, recordPopupEvent } from "@/services/popups/popups";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { POST as EVENT } from "../[id]/event/route";
import { GET as NEXT } from "../next/route";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/services/popups/popups");

const signedIn = () =>
  jest.mocked(authenticateRequest).mockResolvedValue({ userId: "u1" });

/** The handlers' type allows no response; every path here returns one. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("The route returned nothing");
  return value;
}

const next = async (qs = "") =>
  must(await NEXT(new NextRequest(`http://needt.test/api/popups/next${qs}`)));
const event = async (id: string, body: unknown) =>
  must(
    await EVENT(
      new NextRequest(`http://needt.test/api/popups/${id}/event`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    )
  );

beforeEach(() => {
  jest.resetAllMocks();
  signedIn();
});

describe("GET /api/popups/next", () => {
  it("requires a signed-in person", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await next()).status).toBe(401);
    expect(getNextPopup).not.toHaveBeenCalled();
  });

  it("passes what the client knows through, and ignores junk", async () => {
    jest.mocked(getNextPopup).mockResolvedValue(null);
    await next(
      "?platform=mac&appVersion=1.4.0&limit=habits&focus=1&dialog=1&session=0&onboarding=1"
    );
    expect(getNextPopup).toHaveBeenCalledWith("u1", {
      platform: "mac",
      appVersion: "1.4.0",
      limit: "habits",
      ctx: {
        inOnboarding: true,
        inFocus: true,
        dialogOpen: true,
        shownThisSession: false,
      },
    });
    await next("?platform=amiga&appVersion=latest&limit=everything");
    expect(getNextPopup).toHaveBeenLastCalledWith(
      "u1",
      expect.objectContaining({
        platform: "web",
        appVersion: null,
        limit: null,
      })
    );
  });

  it("answers null instead of an error when picking fails", async () => {
    jest.mocked(getNextPopup).mockRejectedValue(new Error("db down"));
    const res = await next();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ popup: null });
  });
});

describe("POST /api/popups/:id/event", () => {
  it("requires a signed-in person", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await event("a1", { event: "shown" })).status).toBe(401);
    expect(recordPopupEvent).not.toHaveBeenCalled();
  });

  it.each(["shown", "dismiss", "click", "release"])("accepts %s", async (name) => {
    jest.mocked(recordPopupEvent).mockResolvedValue("ok");
    expect((await event("a1", { event: name })).status).toBe(200);
    expect(recordPopupEvent).toHaveBeenCalledWith("u1", "a1", name);
  });

  it("decodes a moment id", async () => {
    jest.mocked(recordPopupEvent).mockResolvedValue("ok");
    await event("moment%3Alimit%3Alimit%3Ahabits", { event: "shown" });
    expect(recordPopupEvent).toHaveBeenCalledWith(
      "u1",
      "moment:limit:limit:habits",
      "shown"
    );
  });

  it("rejects an unknown event", async () => {
    expect((await event("a1", { event: "explode" })).status).toBe(400);
    expect(recordPopupEvent).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown popup", async () => {
    jest.mocked(recordPopupEvent).mockResolvedValue("not_found");
    expect((await event("nope", { event: "shown" })).status).toBe(404);
  });
});
