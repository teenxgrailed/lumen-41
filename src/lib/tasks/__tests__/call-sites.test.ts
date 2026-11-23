import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Idea cards put a second kind of row in `Task`. Every read that means "the
 * person's tasks" must leave ideas out, and the readers that matter most are
 * the scheduler (capacity), the day plan, Always easy start, reminders, nudges
 * and the notification feed (overdue, due soon, digest). This test lists every
 * `prisma.task.find*` / `count` / `groupBy` call in that code and fails when a
 * call neither spreads `openTaskWhere()` nor names `kind`.
 *
 * A read that must reach ideas on purpose says so with a comment containing
 * `idea-exempt:` and the reason, right before the call.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

/** The scheduler and everything that reads tasks to decide, plan or tell. */
const SCOPE = [
  "src/services/scheduling",
  "src/services/notifications",
  "src/services/reminders",
  "src/services/nudges",
  "src/services/day-plan",
  "src/services/easy-start",
  "src/services/channels",
  "src/services/email-lifecycle",
  "src/services/connectors/today.ts",
  "src/worker",
  "src/lib/task-block-push.ts",
];

const CALL =
  /\.task\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|groupBy)\(/g;

function sourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    if (name === "__tests__" || name === "node_modules") return [];
    const child = join(path, name);
    if (statSync(join(ROOT, child)).isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [join(ROOT, child)]
      : [];
  });
}

/** The text between the call's parentheses, or null when they do not close. */
function argumentsAt(source: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

export interface Call {
  method: string;
  line: number;
  guarded: boolean;
}

/** Every task read in `source`, and whether it keeps ideas out or says why not. */
export function taskReads(source: string): Call[] {
  const out: Call[] = [];
  for (const match of source.matchAll(CALL)) {
    const start = match.index ?? 0;
    const open = start + match[0].length - 1;
    const args = argumentsAt(source, open) ?? "";
    const before = source.slice(Math.max(0, start - 400), start);
    out.push({
      method: match[1],
      line: source.slice(0, start).split("\n").length,
      guarded:
        args.includes("openTaskWhere") ||
        /\bkind\s*:/.test(args) ||
        /idea-exempt:/.test(before),
    });
  }
  return out;
}

describe("taskReads (the check itself)", () => {
  it("passes a read that spreads the helper", () => {
    expect(
      taskReads(
        "await prisma.task.findMany({ where: { userId, ...openTaskWhere() } });"
      )
    ).toEqual([{ method: "findMany", line: 1, guarded: true }]);
  });

  it("passes a read that names kind", () => {
    expect(
      taskReads('prisma.task.count({ where: { userId, kind: "IDEA" } })')[0]
        .guarded
    ).toBe(true);
    expect(
      taskReads(
        "prisma.task.findUnique({ where: { id }, select: { id: true, kind: true } })"
      )[0].guarded
    ).toBe(true);
  });

  it("passes a read with a stated reason", () => {
    expect(
      taskReads(
        "// idea-exempt: clearing blocks reaches every row\nprisma.task.findMany({ where: { userId } })"
      )[0].guarded
    ).toBe(true);
  });

  it("fails a read that does neither, in any client", () => {
    for (const client of ["prisma", "tx", "db", "ctx.tx"]) {
      expect(
        taskReads(`await ${client}.task.findFirst({ where: { id } })`)[0]
          .guarded
      ).toBe(false);
    }
    expect(
      taskReads("prisma.task.groupBy({ by: ['userId'], where: {} })")[0].guarded
    ).toBe(false);
  });

  it("does not mistake a word that merely contains kind", () => {
    expect(
      taskReads("prisma.task.findMany({ where: { workKindOf: 1 } })")[0].guarded
    ).toBe(false);
  });
});

describe("scheduler and notification task reads leave ideas out", () => {
  const files = SCOPE.flatMap(sourceFiles);
  const reads = files.flatMap((file) =>
    taskReads(readFileSync(file, "utf8")).map((call) => ({
      ...call,
      file: relative(ROOT, file),
    }))
  );

  it("finds the reads it is meant to guard", () => {
    // A path rename must not turn this into a test of nothing.
    expect(reads.length).toBeGreaterThan(25);
    const dirs = new Set(
      reads.map((r) => r.file.split("/").slice(0, 3).join("/"))
    );
    for (const dir of [
      "src/services/scheduling",
      "src/services/notifications",
      "src/services/nudges",
      "src/services/day-plan",
      "src/services/easy-start",
    ]) {
      expect(dirs).toContain(dir);
    }
  });

  it("has no read that neither uses openTaskWhere() nor names kind", () => {
    const loose = reads
      .filter((read) => !read.guarded)
      .map((read) => `${read.file}:${read.line} ${read.method}`);
    expect(loose).toEqual([]);
  });
});
