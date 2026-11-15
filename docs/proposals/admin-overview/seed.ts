/**
 * Seed for the Admin Overview before/after screenshots. Run it against a
 * throwaway database only (after `prisma/ci-seed.ts`), never production:
 *
 *   DATABASE_URL=... npx tsx docs/proposals/admin-overview/seed.ts
 *
 * Fictional people. The mix imitates the real Overview that prompted the
 * change: most "Pro" accounts are ours or comps, one person actually paid.
 * The owner's own test address is "owner.test@gmail.com"; start the "after"
 * server with INTERNAL_ACCOUNT_EMAILS=owner.test@gmail.com.
 */
import {
  PrismaClient,
  SandboxKind,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const now = Date.now();
const DAY = 86_400_000;
const ago = (days: number) => new Date(now - days * DAY);

type Seed = {
  email: string;
  createdDaysAgo: number;
  activeDaysAgo?: number;
  role?: string;
  sandboxKind?: SandboxKind;
  internal?: boolean;
};

const people: Seed[] = [
  // Ours: admins, sandbox, test addresses, the owner's own mailbox.
  { email: "owner.test@gmail.com", createdDaysAgo: 60, activeDaysAgo: 0 },
  { email: "owner.alt+test@gmail.com", createdDaysAgo: 55, activeDaysAgo: 1 },
  {
    email: "reviewer@sandbox.needt.app",
    createdDaysAgo: 30,
    activeDaysAgo: 0,
    sandboxKind: SandboxKind.reviewer,
  },
  { email: "qa@gmail.com", createdDaysAgo: 20, activeDaysAgo: 2 },
  { email: "hello@needt.app", createdDaysAgo: 70, activeDaysAgo: 1 },
  // External people.
  { email: "anna.keller@example-mail.ch", createdDaysAgo: 3, activeDaysAgo: 0 },
  { email: "marc.vogel@example-mail.ch", createdDaysAgo: 5, activeDaysAgo: 1 },
  { email: "lena.huber@example-mail.ch", createdDaysAgo: 6, activeDaysAgo: 2 },
  { email: "tim.frei@example-mail.ch", createdDaysAgo: 9, activeDaysAgo: 4 },
  { email: "sara.meier@example-mail.ch", createdDaysAgo: 12, activeDaysAgo: 3 },
  { email: "jonas.baer@example-mail.ch", createdDaysAgo: 15, activeDaysAgo: 9 },
  { email: "nina.roth@example-mail.ch", createdDaysAgo: 18, activeDaysAgo: 6 },
  { email: "paul.graf@example-mail.ch", createdDaysAgo: 21, activeDaysAgo: 14 },
  { email: "eva.lang@example-mail.ch", createdDaysAgo: 25, activeDaysAgo: 20 },
  { email: "ben.weiss@example-mail.ch", createdDaysAgo: 33, activeDaysAgo: 5 },
  { email: "lia.moser@example-mail.ch", createdDaysAgo: 38, activeDaysAgo: 30 },
  {
    email: "noah.fuchs@example-mail.ch",
    createdDaysAgo: 41,
    activeDaysAgo: 12,
  },
  { email: "zoe.brun@example-mail.ch", createdDaysAgo: 47, activeDaysAgo: 25 },
  {
    email: "luis.ammann@example-mail.ch",
    createdDaysAgo: 52,
    activeDaysAgo: 40,
  },
  { email: "mia.egger@example-mail.ch", createdDaysAgo: 58, activeDaysAgo: 50 },
];

async function main() {
  const ids = new Map<string, string>();
  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        name: p.email.split("@")[0],
        emailVerified: ago(p.createdDaysAgo),
        createdAt: ago(p.createdDaysAgo),
        lastActiveAt:
          p.activeDaysAgo === undefined ? null : ago(p.activeDaysAgo),
        role: p.role ?? "user",
        sandboxKind: p.sandboxKind ?? null,
        internal: p.internal ?? false,
      },
    });
    ids.set(p.email, user.id);
  }
  const id = (email: string) => {
    const found = ids.get(email);
    if (!found) throw new Error(`no seeded user ${email}`);
    return found;
  };

  // The CI accounts from prisma/ci-seed.ts are ours too: flagged by hand.
  await prisma.user.updateMany({
    where: { email: { endsWith: "@needt.local" } },
    data: { internal: true, lastActiveAt: ago(0) },
  });

  // Plans. "Pro" by plan on 5 accounts, one real payment among them.
  const creemIds = (n: number) => ({
    creemCustomerId: `cus_seed_${n}`,
    creemSubscriptionId: `sub_seed_${n}`,
    creemProductId: "prod_seed_pro",
  });
  const sub = async (
    email: string,
    plan: SubscriptionPlan,
    extra: Record<string, unknown> = {}
  ) =>
    prisma.subscription.upsert({
      where: { userId: id(email) },
      update: {},
      create: {
        userId: id(email),
        plan,
        status: SubscriptionStatus.ACTIVE,
        ...extra,
      },
    });
  // One external person paid for Pro through Creem.
  await sub("sara.meier@example-mail.ch", SubscriptionPlan.PRO, {
    ...creemIds(1),
    provider: "CREEM",
    amount: 700,
    currentPeriodEnd: ago(-20),
  });
  await prisma.creemWebhookEvent.createMany({
    data: [
      {
        id: "evt_seed_1",
        userId: id("sara.meier@example-mail.ch"),
        eventType: "subscription.paid",
        eventCreatedAt: ago(10),
        outcome: "processed",
      },
    ],
    skipDuplicates: true,
  });
  // Comps (granted by hand, no payment ids): one external, two ours.
  await sub("tim.frei@example-mail.ch", SubscriptionPlan.PRO, {
    currentPeriodEnd: null,
  });
  await sub("owner.test@gmail.com", SubscriptionPlan.PRO);
  await sub("reviewer@sandbox.needt.app", SubscriptionPlan.PRO);
  await sub("hello@needt.app", SubscriptionPlan.LIFETIME);

  // Trials for three people who have not bought anything.
  for (const [n, email] of [
    "anna.keller@example-mail.ch",
    "marc.vogel@example-mail.ch",
    "lena.huber@example-mail.ch",
  ].entries()) {
    await prisma.trialGrant.upsert({
      where: { emailKey: email },
      update: {},
      create: {
        emailKey: email,
        userId: id(email),
        startedAt: ago(3 + n),
        endsAt: ago(-(11 - n)),
      },
    });
  }

  // Activation events. External people go through the funnel; ours press Keep
  // too, which is exactly the noise the criterion must not count.
  const events: { email: string; name: string; daysAgo: number }[] = [];
  const add = (email: string, name: string, daysAgo: number) =>
    events.push({ email, name, daysAgo });
  for (const p of people) add(p.email, "account_created", p.createdDaysAgo);
  const connected = [
    "anna.keller",
    "marc.vogel",
    "lena.huber",
    "tim.frei",
    "sara.meier",
    "jonas.baer",
    "nina.roth",
    "ben.weiss",
  ];
  connected.forEach((n, i) =>
    add(`${n}@example-mail.ch`, "calendar_connected", 1 + i * 3)
  );
  const tasked = connected.slice(0, 7);
  tasked.forEach((n, i) => {
    add(`${n}@example-mail.ch`, "task_created", 1 + i * 2);
    add(`${n}@example-mail.ch`, "task_created", 8 + i * 4);
  });
  ["anna.keller", "marc.vogel", "sara.meier", "tim.frei"].forEach((n, i) => {
    add(`${n}@example-mail.ch`, "replan_shown", 1 + i);
    add(`${n}@example-mail.ch`, "first_replan_card_shown", 1 + i);
  });
  add("anna.keller@example-mail.ch", "keep_applied", 1);
  add("marc.vogel@example-mail.ch", "keep_applied", 2);
  add("owner.test@gmail.com", "keep_applied", 0);
  add("qa@gmail.com", "keep_applied", 1);
  add("qa@gmail.com", "task_created", 0);
  add("owner.test@gmail.com", "task_created", 0);
  add("lena.huber@example-mail.ch", "first_replan_skipped", 2);

  for (const e of events) {
    const once = [
      "account_created",
      "calendar_connected",
      "first_replan_card_shown",
      "first_replan_skipped",
    ].includes(e.name);
    await prisma.activationEvent.createMany({
      data: [
        {
          userId: id(e.email),
          name: e.name,
          createdAt: ago(e.daysAgo),
          onceKey: once ? e.name : null,
        },
      ],
      skipDuplicates: true,
    });
  }
  console.log(`seeded ${people.length} people, ${events.length} events`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
