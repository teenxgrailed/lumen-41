import { encode } from "next-auth/jwt";

import { type Page } from "@playwright/test";
import {
  SubscriptionPlan,
  SubscriptionStatus,
  WorkspaceKind,
  WorkspaceRole,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * A real account for a v3 E2E test: a verified user with a personal workspace
 * and (by default) a PRO subscription, so no plan limit or paywall sits between the test
 * and the behaviour it checks. Everything is created through Prisma and the
 * session is a signed cookie, so the screens run against the real API rather
 * than stubs. Each test gets its own user, which keeps the specs independent
 * of run order and of one another's data.
 */
export type V3User = {
  id: string;
  email: string;
  workspaceId: string;
};

let counter = 0;

export async function createV3User(
  label: string,
  { plan = SubscriptionPlan.PRO }: { plan?: SubscriptionPlan } = {}
): Promise<V3User> {
  counter += 1;
  const stamp = `${newDate().getTime()}-${counter}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const email = `v3-${label}-${stamp}@needt.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `V3 ${label}`,
      role: "user",
      emailVerified: newDate(),
    },
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: `V3 ${label}`,
      kind: WorkspaceKind.PERSONAL,
      personalOwnerId: user.id,
    },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: { plan, status: SubscriptionStatus.ACTIVE },
    create: {
      userId: user.id,
      plan,
      status: SubscriptionStatus.ACTIVE,
    },
  });
  return { id: user.id, email, workspaceId: workspace.id };
}

export async function signInAs(page: Page, user: V3User) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for v3 E2E");
  // The companion's first-run introduction would sit over the corner.
  await page.addInitScript(() => {
    sessionStorage.setItem("needt-ai-companion-intro-seen", "1");
  });
  const token = await encode({
    secret,
    maxAge: 60 * 60,
    token: { sub: user.id, email: user.email, role: "user" },
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
