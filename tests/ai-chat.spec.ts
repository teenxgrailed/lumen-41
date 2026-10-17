import { encode } from "next-auth/jwt";

import { type Page, expect, test } from "@playwright/test";

const user = {
  id: "ai-chat-e2e-user",
  name: "AI Chat Owner",
  email: "ai-chat-e2e@needt.local",
  role: "admin",
};

const workspace = {
  id: "ai-chat-workspace",
  name: "Personal",
  kind: "PERSONAL",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const conversationId = "conversation-e2e";
const previewToken = "preview-token-e2e";
const undoToken = "undo-token-e2e";

type RequestPayload = Record<string, unknown>;

test.use({ serviceWorkers: "block" });

async function authenticate(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  expect(secret, "NEXTAUTH_SECRET is required for AI chat E2E").toBeTruthy();
  const token = await encode({
    secret: secret!,
    maxAge: 60 * 60,
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockChat(page: Page) {
  const chatRequests: RequestPayload[] = [];
  const rescheduleRequests: RequestPayload[] = [];

  await page.addInitScript(() => {
    localStorage.setItem(
      "needt-setup-storage",
      JSON.stringify({
        state: {
          hasChecked: true,
          needsSetup: false,
          lastChecked: Date.now(),
        },
        version: 0,
      })
    );
    sessionStorage.setItem("needt-ai-companion-intro-seen", "1");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user,
          expires: "2026-09-25T00:00:00.000Z",
        },
      });
    }
    if (pathname === "/api/workspaces") {
      return route.fulfill({
        json: { workspaces: [{ role: "OWNER", workspace }] },
      });
    }
    if (["/api/tasks", "/api/tags", "/api/projects"].includes(pathname)) {
      return route.fulfill({ json: [] });
    }
    if (pathname === "/api/pages") {
      return route.fulfill({ json: { pages: [] } });
    }
    if (pathname === "/api/customization") {
      return route.fulfill({ json: {} });
    }
    if (pathname === "/api/focus/session") {
      return route.fulfill({ json: { session: null } });
    }
    if (pathname === "/api/notifications") {
      return route.fulfill({ json: { notifications: [] } });
    }
    if (pathname === "/api/ai/briefing-status") {
      return route.fulfill({ json: { overloaded: false } });
    }
    if (pathname === "/api/stream") {
      return route.fulfill({ status: 204 });
    }
    if (pathname === "/api/ai-settings") {
      return route.fulfill({
        json: {
          provider: "OPENAI",
          hasApiKey: true,
          hostedAvailable: false,
        },
      });
    }
    if (pathname === "/api/ai/conversations") {
      return route.fulfill({
        json: {
          conversations: [
            {
              id: conversationId,
              title: "Schedule planning",
              createdAt: "2026-09-24T08:00:00.000Z",
              messages: [],
            },
          ],
        },
      });
    }
    if (pathname === "/api/ai/chat" && request.method() === "POST") {
      chatRequests.push(JSON.parse(request.postData() ?? "{}"));
      const body = [
        JSON.stringify({
          type: "meta",
          conversationId,
          requiresConfirm: false,
          toolName: "auto_schedule",
          toolPayload: {
            changes: [
              {
                taskId: "task-e2e",
                title: "Prepare launch brief",
                fromStart: "2026-09-24T09:00:00.000Z",
                toStart: "2026-09-24T11:00:00.000Z",
              },
            ],
            previewToken,
          },
        }),
        JSON.stringify({
          type: "token",
          value: "Review the proposed schedule change.",
        }),
      ].join("\n");
      return route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: `${body}\n`,
      });
    }
    if (
      pathname === "/api/tasks/reschedule-preview" &&
      request.method() === "POST"
    ) {
      const payload = JSON.parse(request.postData() ?? "{}") as RequestPayload;
      rescheduleRequests.push(payload);
      return route.fulfill({
        json:
          payload.action === "apply"
            ? { applied: true, undoToken }
            : { undone: true },
      });
    }
    return route.fulfill({ json: {} });
  });

  return { chatRequests, rescheduleRequests };
}

async function openReschedulePreview(page: Page) {
  await page.goto("/chat");
  const input = page.getByPlaceholder(
    "Ask anything about your tasks and calendar..."
  );
  await expect(input).toBeEnabled();
  await input.fill("Reschedule my day");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Review the proposed schedule change.")
  ).toBeVisible();
  await expect(
    page.getByText("Schedule preview", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/Prepare launch brief:/)).toBeVisible();
}

test("AI schedule preview can be cancelled without applying it", async ({
  page,
}) => {
  await authenticate(page);
  const state = await mockChat(page);

  await openReschedulePreview(page);
  await expect
    .poll(() => state.chatRequests)
    .toEqual([
      {
        conversationId,
        message: "Reschedule my day",
        confirmed: false,
      },
    ]);

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Schedule preview", { exact: true })).toHaveCount(
    0
  );
  expect(state.rescheduleRequests).toEqual([]);
});

test("AI schedule preview applies and undoes with the returned tokens", async ({
  page,
}) => {
  await authenticate(page);
  const state = await mockChat(page);

  await openReschedulePreview(page);
  await page.getByRole("button", { name: "Apply" }).click();

  await expect
    .poll(() => state.rescheduleRequests)
    .toEqual([{ action: "apply", token: previewToken }]);
  await expect(page.getByText("Schedule updated.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect
    .poll(() => state.rescheduleRequests)
    .toEqual([
      { action: "apply", token: previewToken },
      { action: "undo", token: undoToken },
    ]);
  await expect(page.getByText("Schedule updated.")).toHaveCount(0);
});
