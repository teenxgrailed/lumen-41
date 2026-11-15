// Extra sample data for design shots (.github/workflows/design-shots.yml), written
// on top of the App Review sample planner (.github/store-screenshots/seed.ts all)
// for the CI account. It makes the screens look like a real person's week: more
// projects with colours, goals with progress, a full day, a few overdue tasks and
// habits. Throwaway CI database only.
//
//   npx tsx .github/design-shots/seed-rich.ts      (run from the app checkout)
import { PrismaClient } from "@prisma/client";

import { shiftDay, taskData } from "../../src/services/onboarding/sample-service";

const prisma = new PrismaClient();
const ZONE = "Europe/Zurich";

const PROJECTS = [
  { key: "web", name: "Website redesign", color: "#3B82F6", description: "New landing and pricing pages." },
  { key: "fit", name: "Marathon training", color: "#10B981", description: "Sixteen weeks to the Zurich marathon." },
  { key: "de", name: "German B1", color: "#F59E0B", description: "Exam in March." },
  { key: "shop", name: "Online shop", color: "#EC4899", description: "Resale: listings, shipping, returns." },
  { key: "move", name: "Moving flat", color: "#8B5CF6", description: "Keys on the 1st." },
] as const;

type Key = (typeof PROJECTS)[number]["key"];

const GOALS: { title: string; area: string; days: number; target?: number; current?: number; unit?: string; percent?: number; projects: Key[] }[] = [
  { title: "Ship the new website", area: "work", days: 21, percent: 55, projects: ["web"] },
  { title: "Run a sub-4h marathon", area: "health", days: 90, target: 600, current: 312, unit: "km", projects: ["fit"] },
  { title: "Pass the German B1 exam", area: "learning", days: 120, percent: 35, projects: ["de"] },
  { title: "CHF 3,000 resale revenue this month", area: "money", days: 15, target: 3000, current: 1840, unit: "CHF", projects: ["shop"] },
  { title: "Move into the new flat", area: "home", days: 16, percent: 70, projects: ["move"] },
  { title: "Read 12 books this year", area: "personal", days: 46, target: 12, current: 9, unit: "books", projects: [] },
];

type T = { p: Key; title: string; estimate: number; due?: number; at?: string; priority?: "high" | "low"; done?: boolean };
const TASKS: T[] = [
  { p: "web", title: "Review homepage wireframes", estimate: 45, due: 0, at: "08:30", priority: "high" },
  { p: "de", title: "German: 20 min vocabulary", estimate: 20, due: 0, at: "09:15" },
  { p: "shop", title: "List 5 jackets on Vinted", estimate: 40, due: 0, at: "11:15" },
  { p: "web", title: "Write pricing page copy", estimate: 60, due: 0, at: "12:30", priority: "high" },
  { p: "move", title: "Call the moving company", estimate: 15, due: 0, at: "13:30" },
  { p: "shop", title: "Ship 3 parcels", estimate: 30, due: 0, at: "16:00" },
  { p: "fit", title: "Easy run 8 km", estimate: 50, due: 0, at: "18:15" },
  { p: "de", title: "Grammar: Konjunktiv II exercises", estimate: 30, due: 0 },
  { p: "move", title: "Order boxes", estimate: 10, due: 0 },
  { p: "web", title: "Send the design review notes", estimate: 20, due: 0 },
  { p: "shop", title: "Answer buyer questions", estimate: 15, due: -1 },
  { p: "move", title: "Cancel the internet contract", estimate: 15, due: -3, priority: "high" },
  { p: "web", title: "Fix the footer links", estimate: 20, due: -2 },
  { p: "fit", title: "Long run 24 km", estimate: 150, due: 2, at: "08:00" },
  { p: "de", title: "Mock exam: listening", estimate: 60, due: 3 },
  { p: "web", title: "Launch checklist sign-off", estimate: 30, due: 5 },
  { p: "shop", title: "Photograph new stock", estimate: 90, due: 1, at: "10:00" },
  { p: "web", title: "Moodboard for the hero", estimate: 30, due: -1, done: true },
  { p: "fit", title: "Intervals 6×800 m", estimate: 60, due: -1, done: true },
  { p: "de", title: "Podcast episode 14", estimate: 25, due: -2, done: true },
];

const HABITS = [
  { title: "Stretch", at: "07:30", minutes: 10, perWeek: 7, doneDaysAgo: [1, 2, 3, 4, 6] },
  { title: "No phone after 22:00", at: "22:00", minutes: 5, perWeek: 7, doneDaysAgo: [1, 3, 4] },
];

async function main() {
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!member) throw new Error(`${email} has no workspace yet; sign in first`);
  const owner = { userId: user.id, workspaceId: member.workspaceId };
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

  const projectIds = new Map<Key, string>();
  for (const p of PROJECTS) {
    const row = await prisma.project.create({
      data: { ...owner, name: p.name, color: p.color, description: p.description, status: "active" },
      select: { id: true },
    });
    projectIds.set(p.key, row.id);
  }

  for (const [i, g] of GOALS.entries()) {
    const goal = await prisma.goal.create({
      data: {
        ...owner,
        title: g.title,
        area: g.area,
        position: i + 2,
        deadline: new Date(`${shiftDay(today, g.days)}T00:00:00.000Z`),
        targetValue: g.target ?? null,
        currentValue: g.current ?? null,
        unit: g.unit ?? null,
        manualPercent: g.percent ?? null,
      },
      select: { id: true },
    });
    for (const k of g.projects) {
      await prisma.goalProject.create({ data: { goalId: goal.id, projectId: projectIds.get(k)! } });
    }
  }

  for (const t of TASKS) {
    const base = taskData({ title: t.title, estimate: t.estimate, due: t.due, at: t.at, priority: t.priority }, today, ZONE);
    await prisma.task.create({
      data: {
        ...base,
        ...owner,
        isSample: false,
        projectId: projectIds.get(t.p)!,
        ...(t.done ? { status: "completed", completedAt: new Date(now.getTime() - 86_400_000) } : {}),
      },
    });
  }

  for (const h of HABITS) {
    await prisma.habit.create({
      data: {
        ...owner,
        title: h.title,
        at: h.at,
        estimatedMinutes: h.minutes,
        quota: h.perWeek,
        targetOccurrencesPerWeek: h.perWeek,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        completions: { create: h.doneDaysAgo.map((ago) => ({ date: new Date(`${shiftDay(today, -ago)}T00:00:00.000Z`) })) },
      },
    });
  }

  console.log(`rich seed: ${PROJECTS.length} projects, ${GOALS.length} goals, ${TASKS.length} tasks, ${HABITS.length} habits for ${today}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
