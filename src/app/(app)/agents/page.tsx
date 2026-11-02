import { notFound } from "next/navigation";

import { getServerSession } from "next-auth";

import { AgentsScreen } from "@/components/needt3/agents/AgentsScreen";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { agentHubEnabled } from "@/lib/feature-flags";
import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("agents");

export const dynamic = "force-dynamic";

/** The Agents screen exists only for accounts the `agent_hub` flag is on for. */
export default async function AgentsRoute() {
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id;
  if (!userId || !(await agentHubEnabled(userId))) notFound();
  return <AgentsScreen />;
}
