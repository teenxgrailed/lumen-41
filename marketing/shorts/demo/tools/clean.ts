import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
// Demo DB only: removes tasks whose title starts with the given text (re-takes of the composer scene).
(async () => {
  const u = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const r = await prisma.task.deleteMany({ where: { userId: u.id, title: { startsWith: process.argv[3] } } });
  console.log("deleted", r.count);
})().finally(() => prisma.$disconnect());
