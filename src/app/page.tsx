import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth/auth-options";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  // Home is /today: the PWA start_url, onboarding finish and the dock's Home
  // all land there, so the bare address must too.
  redirect(session ? "/today" : "/auth/signin");
}
