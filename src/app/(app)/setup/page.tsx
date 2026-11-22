import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { OnboardingScreen } from "@/components/needt3/auth/OnboardingScreen";
import { SetupForm } from "@/components/setup/SetupForm";

import { APP_NAME } from "@/lib/app-config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { SECTION_TITLES } from "@/lib/needt3/section-titles";
import { checkSetupStatus } from "@/lib/setup-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: SECTION_TITLES.setup,
  description: `Set up your ${APP_NAME} account`,
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  // A signed-in person gets first-run setup (the five onboarding steps).
  // Everyone else keeps the admin account form below.
  const session = await getServerSession(await getAuthOptions());
  if (session?.user?.id) {
    // `?step=` opens setup on one step (design shots, a link from Settings);
    // a step the face does not show starts at the first.
    const { step } = await searchParams;
    return (
      <OnboardingScreen startAt={typeof step === "string" ? step : null} />
    );
  }

  // Check if any users already exist
  const { needsSetup } = await checkSetupStatus();

  // If users already exist, redirect to home page
  if (!needsSetup) {
    redirect("/calendar");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold">{APP_NAME} Setup</h1>
        <p className="text-muted-foreground">
          Create your local planner account to get started
        </p>
      </div>

      <SetupForm />
    </div>
  );
}
