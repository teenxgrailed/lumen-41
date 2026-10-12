import {
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";

import { newDate } from "../src/lib/date-utils";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash("Needt-ci-Password1", 8);
  const workspacesFlag = await prisma.featureFlag.upsert({
    where: { key: "workspaces" },
    update: {},
    create: {
      key: "workspaces",
      enabled: false,
      rolloutPercentage: 0,
      description: "Workspace tenancy boundary rollout",
    },
  });

  // Registration is closed in production until launch; the e2e suites sign
  // new accounts up, so CI opens it the way the owner will at launch.
  await prisma.featureFlag.upsert({
    where: { key: "signups_open" },
    update: { enabled: true, rolloutPercentage: 100 },
    create: {
      key: "signups_open",
      enabled: true,
      rolloutPercentage: 100,
      description: "New account registration (closed until launch)",
    },
  });

  for (const plan of [
    SubscriptionPlan.FREE,
    SubscriptionPlan.PRO,
    SubscriptionPlan.LIFETIME,
  ]) {
    const email = `ci-${plan.toLowerCase()}@needt.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role: plan === SubscriptionPlan.LIFETIME ? "admin" : "user",
        emailVerified: newDate(),
      },
      create: {
        email,
        emailVerified: newDate(),
        name: `CI ${plan}`,
        role: plan === SubscriptionPlan.LIFETIME ? "admin" : "user",
      },
    });

    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "credentials",
          providerAccountId: email,
        },
      },
      update: { userId: user.id, id_token: passwordHash },
      create: {
        userId: user.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: email,
        id_token: passwordHash,
      },
    });

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: { plan, status: SubscriptionStatus.ACTIVE },
      create: { userId: user.id, plan, status: SubscriptionStatus.ACTIVE },
    });

    await prisma.featureFlagOverride.upsert({
      where: {
        flagKey_userId: { flagKey: workspacesFlag.key, userId: user.id },
      },
      update: { enabled: true },
      create: {
        flagKey: workspacesFlag.key,
        userId: user.id,
        enabled: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
