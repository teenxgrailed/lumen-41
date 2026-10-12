import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { OnboardingScreen } from "@/components/needt3/auth/OnboardingScreen";
import { SetupForm } from "@/components/setup/SetupForm";

import { APP_NAME } from "@/lib/app-config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { isDesignV3 } from "@/lib/needt3/design-flag";
import { checkSetupStatus } from "@/lib/setup-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Setup ${APP_NAME}`,
  description: `Set up your ${APP_NAME} account`,
};

export default async function SetupPage() {
  // Design v3: a signed-in person with the flag on gets first-run setup (the
  // five onboarding steps). Everyone else keeps the admin account form below.
  const session = await getServerSession(await getAuthOptions());
  if (session?.user?.id && (await isDesignV3())) {
    return <OnboardingScreen />;
  }

  // Check if any users already exist
  const { needsSetup } = await checkSetupStatus();

  // If users already exist, redirect to home page
  if (!needsSetup) {
    redirect("/calendar");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
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
