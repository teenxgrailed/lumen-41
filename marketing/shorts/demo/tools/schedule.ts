import { readFileSync } from "fs";
import { SchedulingRunSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSchedulingRun, executeSchedulingRun } from "@/services/scheduling/runs";
// Runs the scheduler for the demo user, exactly what the worker does on a run.
(async () => {
  const u = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const run = await createSchedulingRun({ userId: u.id, source: SchedulingRunSource.MANUAL, dedupeKey: `demo:${Date.now()}` });
  const r = await executeSchedulingRun(run.id);
  console.log("run", r?.status, "changed", r?.changedTaskCount, "unscheduled", JSON.stringify(r?.unscheduled)?.slice(0, 200));
  const ts = await prisma.task.findMany({ where: { userId: u.id }, select: { title: true, dueDate: true, scheduledStart: true, scheduledEnd: true }, orderBy: { scheduledStart: "asc" } });
  for (const t of ts) console.log(t.scheduledStart?.toISOString() ?? "-", t.title, "due", t.dueDate?.toISOString().slice(0, 10));
})().finally(() => prisma.$disconnect());
