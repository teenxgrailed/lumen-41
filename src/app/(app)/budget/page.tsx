import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { BudgetScreen } from "@/components/needt3/budget/BudgetScreen";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { budgetModuleEnabled } from "@/lib/feature-flags";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("budget");

export const dynamic = "force-dynamic";

/** The Budget place exists only for accounts the `budget_module` flag is on for. */
export default async function BudgetRoute() {
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id;
  if (!userId || !(await budgetModuleEnabled(userId))) notFound();
  return <BudgetScreen />;
}
