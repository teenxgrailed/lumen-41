import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * A folder's look: each folder wears one of six looks (random from its id by
 * default), and the owner picks one from the folder's right-click menu. The
 * choice is stored on the project, survives a reload, comes back over the API
 * the way a connector reads it, and a value outside 1..6 is a 400.
 */

test("a folder's look is changed from its menu and persists", async ({
  page,
}) => {
  const user = await createV3User("folder-style");
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name: "Alpha site",
      color: "#2e6de9",
    },
  });
  await prisma.project.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name: "Beta shop",
      color: "#d1622a",
    },
  });
  await signInAs(page, user);

  await page.goto("/projects");
  const folder = page.getByRole("link", { name: /^Open Alpha site/ });
  await expect(folder).toBeVisible({ timeout: 90_000 });
  // Auto: a look from its id, 1..6, the same on every load
  const look = async () =>
    (await folder.getAttribute("class"))?.match(/fl-v([1-6])/)?.[1];
  const auto = await look();
  expect(auto).toMatch(/^[1-6]$/);
  await page.reload();
  expect(await look()).toBe(auto);

  const pick = auto === "6" ? "Stamp and clip" : "Dark frosted";
  const want = auto === "6" ? "4" : "6";
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Folder style/ }).click();
  await expect(
    page.getByRole("menuitem", { name: /^Auto \(random\)/ })
  ).toBeVisible();
  await page.getByRole("menuitem", { name: new RegExp(`^${pick}`) }).click();

  await expect(folder).toHaveClass(new RegExp(`fl-v${want}\\b`));
  await expect
    .poll(
      async () =>
        (await prisma.project.findUnique({ where: { id: project.id } }))
          ?.folderStyle
    )
    .toBe(Number(want));

  // it persists across a reload and is on the API
  await page.reload();
  await expect(folder).toHaveClass(new RegExp(`fl-v${want}\\b`));
  const res = await page.request.get("/api/projects?status=active");
  const rows = (await res.json()) as {
    id: string;
    folderStyle: number | null;
  }[];
  expect(rows.find((p) => p.id === project.id)?.folderStyle).toBe(Number(want));

  // back to Auto: the stored choice is cleared
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Folder style/ }).click();
  await page.getByRole("menuitem", { name: /^Auto \(random\)/ }).click();
  await expect
    .poll(
      async () =>
        (await prisma.project.findUnique({ where: { id: project.id } }))
          ?.folderStyle
    )
    .toBeNull();
  await expect(folder).toHaveClass(new RegExp(`fl-v${auto}\\b`));
});

test("the API takes 1..6 or null for folderStyle and refuses the rest", async ({
  page,
}) => {
  const user = await createV3User("folder-style-api");
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name: "Gamma",
    },
  });
  await signInAs(page, user);
  const put = (folderStyle: unknown) =>
    page.request.put(`/api/projects/${project.id}`, { data: { folderStyle } });
  const stored = async () =>
    (await prisma.project.findUnique({ where: { id: project.id } }))
      ?.folderStyle;

  expect((await put(3)).ok()).toBe(true);
  expect(await stored()).toBe(3);
  for (const bad of [0, 7, 2.5, "3"])
    expect((await put(bad)).status()).toBe(400);
  expect(await stored()).toBe(3);
  expect((await put(null)).ok()).toBe(true);
  expect(await stored()).toBeNull();
});
