import { NextRequest } from "next/server";

import { PATCH as calendarSettingsPatch } from "@/app/api/calendar-settings/route";
import { POST as caldavEventsPost } from "@/app/api/calendar/caldav/events/route";
import { PATCH as customizationPatch } from "@/app/api/customization/route";
import { PATCH as notificationSettingsPatch } from "@/app/api/notification-settings/route";
import { POST as taskDependencyPost } from "@/app/api/tasks/[id]/dependencies/route";
import { POST as taskPost } from "@/app/api/tasks/route";
import { PATCH as userSettingsPatch } from "@/app/api/user-settings/route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(async () => ({
    userId: "u1",
    workspace: { workspaceId: "w1", role: "OWNER" },
  })),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

type Handler = (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response | undefined>;

const routes: Array<[string, Handler, string]> = [
  ["PATCH /api/user-settings", userSettingsPatch, "PATCH"],
  ["PATCH /api/customization", customizationPatch, "PATCH"],
  ["PATCH /api/notification-settings", notificationSettingsPatch, "PATCH"],
  ["PATCH /api/calendar-settings", calendarSettingsPatch, "PATCH"],
  ["POST /api/tasks", taskPost, "POST"],
  ["POST /api/tasks/[id]/dependencies", taskDependencyPost, "POST"],
  ["POST /api/calendar/caldav/events", caldavEventsPost, "POST"],
];

describe("malformed JSON body", () => {
  it.each(routes)("%s answers 400, not 500", async (_name, handler, method) => {
    for (const body of ["{not json", ""]) {
      const request = new NextRequest("http://localhost/api/x", {
        method,
        headers: { "content-type": "application/json" },
        body,
      });
      const response = await handler(request, {
        params: Promise.resolve({ id: "t1" }),
      });
      expect(response?.status).toBe(400);
    }
  });
});
