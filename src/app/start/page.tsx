import { getServerSession } from "next-auth/next";

import { Ob3Flow } from "@/components/onboarding/Ob3Flow";

import { APP_NAME } from "@/lib/app-config";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Plan your week · ${APP_NAME}`,
  description:
    "Tell Needt what fills your week and see the plan before you make an account.",
};

/**
 * The 18-screen onboarding. Public: the first half runs before there is an
 * account. A signed-in visitor (back from Apple/Google, or someone who already
 * has an account) is carried past the account screens.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id ?? null;
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true },
      })
    : null;
  return (
    <Ob3Flow
      session={
        userId
          ? {
              userId,
              verified: Boolean(user?.emailVerified),
              email: user?.email ?? null,
            }
          : null
      }
      startStep={step}
    />
  );
}
