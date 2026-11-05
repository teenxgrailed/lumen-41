import { writeFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createV3User } from "../../../../../../../home/user/wt-map/tests/helpers/v3-user";
import { enableAgentHub } from "../../../../../../../home/user/wt-map/tests/helpers/agent-hub";

async function main() {
  const u = await createV3User("map-demo");
  await prisma.user.update({ where: { id: u.id }, data: { name: "Alex" } });
  await enableAgentHub(u.id);
  const now = Date.now();
  const names: [string, string][] = [["Claude", "claude"], ["Codex", "codex"], ["Grok", "grok"], ["Research bot", "other"], ["Mail triage", "routine"]];
  const agents = [];
  for (const [i, [name, kind]] of names.entries()) {
    agents.push(await prisma.hubAgent.create({ data: { userId: u.id, workspaceId: u.workspaceId, connectionKey: `demo:${i}`, name, kind, skills: ["writing"], lastSeenAt: new Date(now - i * 3 * 60_000) } }));
  }
  const items: [string, string, number | null, string[]?][] = [
    ["Draft the launch post", "in_progress", 0],
    ["Summarise this week's feedback", "in_progress", 3],
    ["Fix the flaky calendar test", "in_progress", 1],
    ["Sort the inbox into today and later", "in_progress", 4],
    ["Write the release notes", "done", 0],
    ["Tag last month's receipts", "done", 4],
    ["Compare three CRM exports", "done", 3],
    ["Refactor the reminder worker", "done", 1],
    ["Post the build log", "needs_owner", 2, ["publish"]],
    ["Pay the hosting invoice", "needs_owner", 4, ["money"]],
    ["Pick a hero image", "blocked", 2],
    ["Translate the onboarding copy", "claimed", 0],
    ["Find five podcasts to pitch", "open", null],
    ["Check the sitemap", "open", 3],
    ["Clean up old branches", "in_progress", 1],
  ];
  const made = [];
  for (const [k, [title, status, a, risks]] of items.entries()) {
    const agent = a === null ? null : agents[a];
    made.push(await prisma.hubItem.create({ data: {
      userId: u.id, workspaceId: u.workspaceId, title, goal: title, doneCriteria: "Done", criteriaItems: ["Done", "Checked"], context: "",
      risks: risks ?? [], status, creatorKind: "owner", assigneeAgentId: agent?.id ?? null,
      claimedByAgentId: ["in_progress", "claimed", "blocked", "needs_owner"].includes(status) ? agent?.id ?? null : null,
      blockedOn: status === "blocked" ? "Waiting on the brand colours" : null,
      question: status === "needs_owner" ? "OK to go ahead?" : null,
      ownerUnread: status === "needs_owner",
      result: status === "done" ? { summary: "Finished and checked." } : undefined,
      closedAt: status === "done" ? new Date(now - k * 20 * 60_000) : null,
      createdAt: new Date(now - (k + 2) * 45 * 60_000),
    } }));
  }
  // Threads: one agent waits on your reply, two talk to each other.
  const threads: [string, number, number[], boolean, number][] = [
    ["Which tone for the post?", 0, [], true, 0],
    ["Hand-off: test fix", 1, [0], false, 2],
    ["Sources for the summary", 3, [2], false, 1],
  ];
  for (const [subject, from, to, toOwner, itemIx] of threads) {
    const t = await prisma.hubThread.create({ data: { userId: u.id, workspaceId: u.workspaceId, subject, itemId: made[itemIx].id, ownerUnread: toOwner } });
    await prisma.hubMessage.create({ data: { threadId: t.id, userId: u.id, workspaceId: u.workspaceId, fromKind: "agent", fromAgentId: agents[from].id, toAgentIds: to.map((i) => agents[i].id), toOwner, body: subject, ackRequired: toOwner } });
  }
  writeFileSync(process.argv[2], JSON.stringify(u));
  console.log("seeded", u.email);
}
main().finally(() => prisma.$disconnect());
