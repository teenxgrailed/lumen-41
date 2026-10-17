import { type Page, expect, test } from "@playwright/test";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * Docs on the v3 screens, against the real API and database: make one, write
 * in it and find the title and text still there after a reload; move one to
 * Trash and bring it back; and a Viewer of a shared doc who can read it and
 * not change it.
 */

async function seedDoc(user: V3User, title: string, text = "Body text") {
  const page = await prisma.page.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title,
      isPrivate: false,
    },
  });
  await prisma.pageBlock.create({
    data: {
      pageId: page.id,
      type: "PARAGRAPH",
      position: 1024,
      content: {
        json: {
          type: "paragraph",
          attrs: { blockId: `${page.id}-block` },
          content: [{ type: "text", text }],
        },
      },
    },
  });
  return page;
}

/** The transient "what you did" pill at the bottom centre. */
const notices = (page: Page) =>
  page.getByRole("region", { name: "Needt action notices" });

test("Docs: a new doc takes a title and text, saves, and keeps both after a reload", async ({
  page,
}) => {
  const user = await createV3User("docs-create");
  await signInAs(page, user);

  await page.goto("/pages");
  await expect(page.getByText("No documents yet")).toBeVisible();
  await page.getByRole("button", { name: "New document" }).click();
  await page.getByRole("menuitem", { name: /New Doc/ }).click();
  await page.waitForURL(/\/pages\/[^/]+$/);
  const id = page.url().split("/").pop() as string;

  const title = page.locator("[data-page-title]");
  await title.fill("Launch brief");
  // Enter ends the title and moves to the first line of the page.
  await title.press("Enter");
  await expect(page.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.type("Draft the announcement");

  await expect
    .poll(async () => (await prisma.page.findUnique({ where: { id } }))?.title)
    .toBe("Launch brief");
  await expect
    .poll(async () =>
      JSON.stringify(await prisma.pageBlock.findMany({ where: { pageId: id } }))
    )
    .toContain("Draft the announcement");

  await page.reload();
  await expect(page.locator("[data-page-title]")).toHaveValue("Launch brief");
  await expect(page.locator(".ProseMirror")).toContainText(
    "Draft the announcement"
  );

  // And the doc is on the Docs screen under the title it was saved with.
  await page.goto("/pages");
  await expect(page.getByRole("link", { name: /^Launch brief/ })).toBeVisible();
});

test("Docs: a doc moved to Trash leaves the list and comes back with Restore", async ({
  page,
}) => {
  const user = await createV3User("docs-trash");
  await signInAs(page, user);
  const doc = await seedDoc(user, "Old plan");
  const trashedAt = async () =>
    (await prisma.page.findUnique({ where: { id: doc.id } }))?.trashedAt;

  await page.goto("/pages");
  const card = page.getByRole("link", { name: /^Old plan/ });
  await expect(card).toBeVisible();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();

  await expect(notices(page)).toContainText("“Old plan” moved to Trash");
  await expect(card).toHaveCount(0);
  await expect.poll(trashedAt).not.toBeNull();

  await page.goto("/trash");
  await expect(page.getByTitle("Old plan")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect.poll(trashedAt).toBeNull();

  await page.goto("/pages");
  await expect(page.getByRole("link", { name: /^Old plan/ })).toBeVisible();
});

test("Docs: a Viewer of a shared workspace reads a doc and cannot edit it", async ({
  page,
}) => {
  const owner = await createV3User("docs-owner");
  const viewer = await createV3User("docs-viewer");
  const shared = await prisma.workspace.create({
    data: { name: "Launch team", kind: WorkspaceKind.SHARED },
  });
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: shared.id, userId: owner.id, role: WorkspaceRole.OWNER },
      { workspaceId: shared.id, userId: viewer.id, role: WorkspaceRole.VIEWER },
    ],
  });
  // Shared workspaces are behind a per-person flag.
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_userId: { flagKey: "workspaces", userId: viewer.id } },
    update: { enabled: true },
    create: { flagKey: "workspaces", userId: viewer.id, enabled: true },
  });
  const doc = await seedDoc(
    { ...owner, workspaceId: shared.id },
    "Shared brief",
    "Permission boundary"
  );
  await signInAs(page, viewer);
  // The app opens in the workspace it was last in.
  await page.addInitScript((workspaceId) => {
    localStorage.setItem("needt-active-workspace-id", workspaceId);
  }, shared.id);

  await page.goto("/pages");
  await expect(page.getByRole("link", { name: /^Shared brief/ })).toBeVisible();

  await page.goto(`/pages/${doc.id}`);
  await expect(page.locator("[data-page-title]")).toHaveValue("Shared brief");
  await expect(page.locator(".ProseMirror")).toContainText(
    "Permission boundary"
  );
  await expect(page.locator("[data-page-title]")).toHaveAttribute(
    "readonly",
    ""
  );
  await expect(page.locator(".ProseMirror")).toHaveAttribute(
    "contenteditable",
    "false"
  );

  // A write the screen would not offer is refused by the API as well.
  const refused = await page.request.patch(`/api/pages/${doc.id}`, {
    data: { title: "Hijacked" },
    headers: { "x-workspace-id": shared.id },
  });
  expect(refused.ok()).toBe(false);
  expect((await prisma.page.findUnique({ where: { id: doc.id } }))?.title).toBe(
    "Shared brief"
  );
});
