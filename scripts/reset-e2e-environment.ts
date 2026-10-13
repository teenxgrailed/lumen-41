import {
  prepareE2eEnvironment,
  resetLocalE2eEnvironment,
} from "../tests/e2e/environment";

/**
 * `NEEDT_DESIGN=v3 npm run test:visual …` runs the suite against the v3
 * frame: the visual user gets a `design_v3` override. Without the variable
 * nothing is written and the visual user sees the old design, which is what
 * the committed baselines are.
 *
 * The visual user is created here (by email, the same upsert key the visual
 * global setup uses) because the reset above wipes the database first.
 */
async function enableDesignV3ForVisualUser() {
  const [{ prisma }, { DESIGN_V3 }, { VISUAL_TEST_EMAIL }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/feature-flags-keys"),
    import("../tests/visual/fixtures"),
  ]);
  try {
    const user = await prisma.user.upsert({
      where: { email: VISUAL_TEST_EMAIL },
      update: {},
      create: { email: VISUAL_TEST_EMAIL, name: "Visual QA", role: "admin" },
    });
    // The migration inserts the flag disabled at 0 %; upsert keeps that if a
    // database somehow predates it.
    await prisma.featureFlag.upsert({
      where: { key: DESIGN_V3 },
      update: {},
      create: { key: DESIGN_V3, enabled: false, rolloutPercentage: 0 },
    });
    await prisma.featureFlagOverride.upsert({
      where: { flagKey_userId: { flagKey: DESIGN_V3, userId: user.id } },
      update: { enabled: true },
      create: { flagKey: DESIGN_V3, userId: user.id, enabled: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

void (async () => {
  await resetLocalE2eEnvironment();
  await prepareE2eEnvironment();
  if (process.env.NEEDT_DESIGN === "v3") {
    await enableDesignV3ForVisualUser();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
