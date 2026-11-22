// Throwaway DB only. Tasks with an `entry` (the first easy step) for the
// easy-start row exploration (design/easy-start-row). Run after signing in once.
import { PrismaClient } from "@prisma/client";

import { taskData } from "../../src/services/onboarding/sample-service";

const prisma = new PrismaClient();
const ZONE = "Europe/Zurich";

const PROJECTS = [
  { key: "web", name: "Website redesign", color: "#3B82F6" },
  { key: "de", name: "German B1", color: "#F59E0B" },
  { key: "shop", name: "Online shop", color: "#EC4899" },
  { key: "move", name: "Moving flat", color: "#8B5CF6" },
] as const;
type Key = (typeof PROJECTS)[number]["key"];

type T = {
  p: Key;
  title: string;
  entry?: string;
  estimate: number;
  due?: number;
  at?: string;
  priority?: "high" | "low";
  done?: boolean;
};
const TASKS: T[] = [
  {
    p: "web",
    title: "Write the pricing page copy",
    entry: "Write three headline options",
    estimate: 60,
    due: 0,
    at: "09:00",
    priority: "high",
  },
  {
    p: "shop",
    title: "List five jackets on Vinted",
    entry: "Photograph the first jacket",
    estimate: 40,
    due: 0,
    at: "10:30",
  },
  {
    p: "de",
    title: "Finish the B1 mock exam",
    entry: "Read the first listening prompt",
    estimate: 60,
    due: 0,
    at: "11:30",
  },
  {
    p: "web",
    title: "Send the design review notes to the team and the client",
    entry: "Open last week's notes",
    estimate: 20,
    due: 0,
    at: "13:00",
  },
  {
    p: "move",
    title: "Cancel the internet contract",
    entry: "Find the contract number in your inbox",
    estimate: 30,
    due: -2,
    priority: "high",
  },
  { p: "move", title: "Order boxes", estimate: 10, due: 0 },
  {
    p: "web",
    title: "Fix the footer links",
    entry: "Open the footer file",
    estimate: 30,
    due: 0,
  },
  {
    p: "shop",
    title: "Ship three parcels",
    entry: "Print the first label",
    estimate: 30,
    due: 0,
    at: "16:00",
  },
  {
    p: "de",
    title: "Grammar: Konjunktiv II exercises",
    entry: "Do exercise one only",
    estimate: 30,
    due: 1,
  },
  {
    p: "web",
    title: "Moodboard for the hero",
    entry: "Pin five references",
    estimate: 30,
    due: -1,
    done: true,
  },
];

async function main() {
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  if (!member) throw new Error("no workspace yet; sign in first");
  const owner = { userId: user.id, workspaceId: member.workspaceId };
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const ids = new Map<Key, string>();
  for (const p of PROJECTS) {
    const row = await prisma.project.create({
      data: { ...owner, name: p.name, color: p.color, status: "active" },
      select: { id: true },
    });
    ids.set(p.key, row.id);
  }
  for (const t of TASKS) {
    const base = taskData(
      {
        title: t.title,
        estimate: t.estimate,
        due: t.due,
        at: t.at,
        priority: t.priority,
      },
      today,
      ZONE
    );
    await prisma.task.create({
      data: {
        ...base,
        ...owner,
        isSample: false,
        projectId: ids.get(t.p)!,
        entry: t.entry ?? null,
        ...(t.done
          ? {
              status: "completed",
              completedAt: new Date(now.getTime() - 86_400_000),
            }
          : {}),
      },
    });
  }
  console.log("seeded", TASKS.length, "tasks for", today);
}
main().finally(() => prisma.$disconnect());
