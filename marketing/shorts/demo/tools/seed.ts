import { writeFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { createV3User } from "../../../../tests/helpers/v3-user";

// Demo workspace for the shorts: 9 overdue tasks piled up, nothing placed yet.
async function main() {
  const u = await createV3User("shorts-demo");
  await prisma.user.update({ where: { id: u.id }, data: { name: "Alex" } });
  const work = await prisma.project.create({ data: { name: "Launch", color: "#3b82f6", userId: u.id, workspaceId: u.workspaceId } as any });
  const life = await prisma.project.create({ data: { name: "Personal", color: "#22c55e", userId: u.id, workspaceId: u.workspaceId } as any });
  const day = 24 * 3600_000;
  const now = Date.now();
  const tasks: [string, number, number, string, string][] = [
    ["Finish the pitch deck", 3, 180, "HIGH", "w"],
    ["Reply to the landlord", 2, 20, "MEDIUM", "l"],
    ["Book the dentist", 4, 15, "LOW", "l"],
    ["Review Sam's draft", 1, 90, "HIGH", "w"],
    ["Expense report", 5, 60, "MEDIUM", "w"],
    ["Call mom back", 1, 20, "MEDIUM", "l"],
    ["Fix the onboarding bug", 2, 150, "HIGH", "w"],
    ["Gym: legs", 1, 60, "LOW", "l"],
    ["Plan the team offsite", 3, 90, "MEDIUM", "w"],
  ];
  for (const [title, daysAgo, min, prio, p] of tasks) {
    await prisma.task.create({ data: {
      userId: u.id, workspaceId: u.workspaceId, assigneeId: u.id, title, status: "todo",
      projectId: p === "w" ? work.id : life.id,
      dueDate: new Date(now - daysAgo * day), estimatedMinutes: min, duration: min,
      priorityLevel: prio as any, isAutoScheduled: true, scheduleLocked: false,
      createdAt: new Date(now - (daysAgo + 2) * day),
    } as any });
  }
  writeFileSync(process.argv[2], JSON.stringify(u));
  console.log("seeded", u.email);
}
main().finally(() => prisma.$disconnect());
