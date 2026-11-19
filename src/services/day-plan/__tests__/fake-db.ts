/**
 * A small in-memory stand-in for the Prisma calls the day-plan services make.
 * It models only the filters and writes they use, so the tests run the real
 * plan, review and sweep logic against state instead of asserting call shapes.
 */
type Row = Record<string, unknown> & { id?: string };
type Where = Record<string, unknown>;

/** structuredClone makes Dates from another realm, so no `instanceof`. */
const isDate = (value: unknown): value is Date =>
  Object.prototype.toString.call(value) === "[object Date]";

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !isDate(value) &&
  !Array.isArray(value);

const same = (a: unknown, b: unknown) =>
  isDate(a) && isDate(b)
    ? a.getTime() === b.getTime()
    : (a ?? null) === (b ?? null);

const num = (value: unknown) =>
  isDate(value) ? value.getTime() : (value as number);

const DEFAULTS: Record<string, () => Row> = {
  task: () => ({
    isArchived: false,
    archivedAt: null,
    trashedAt: null,
    somedayAt: null,
    somedayReason: null,
    isSample: false,
    isRecurring: false,
    habitId: null,
    recurrenceMasterId: null,
    lastTouchedAt: null,
    dueDate: null,
    deadline: null,
    scheduledStart: null,
    estimatedMinutes: null,
    duration: null,
    priorityLevel: "MEDIUM",
    activities: [],
  }),
  dayPlan: () => ({
    builtAt: new Date("2026-11-19T20:00:00Z"),
    status: "draft",
    source: "no_note",
    closedAt: null,
    editedByUserAt: null,
  }),
  dayPlanItem: () => ({ isMain: false, addedBy: "draft", resolution: null }),
  channelLink: () => ({ unlinkedAt: null }),
  channelLinkCode: () => ({ usedAt: null }),
  planSettings: () => ({
    limitSuggestionDismissedAt: null,
    limitSuggestion: null,
  }),
};

/** Unique indexes the channel tables rely on (a repeat raises P2002 like Prisma). */
const UNIQUE: Record<string, string[]> = {
  channelUpdate: ["channel", "externalUpdateId"],
  channelLink: ["channel", "externalChatId"],
  channelLinkCode: ["codeHash"],
};

export function createDayPlanDb(start = new Date("2026-11-19T20:00:00Z")) {
  const tables: Record<string, Row[]> = {
    task: [],
    dayPlan: [],
    dayPlanItem: [],
    planSettings: [],
    dailyAgenda: [],
    userSettings: [],
    schedulingPreferences: [],
    featureFlag: [],
    somedayMigrationMove: [],
    scheduledBlock: [],
    autoScheduleSettings: [],
    workSchedule: [],
    flexibleHoursOverride: [],
    calendarEvent: [],
    channelLink: [],
    channelLinkCode: [],
    channelUpdate: [],
  };
  let clock = start.getTime();
  let ids = 0;
  const nextId = (model: string) => `${model}-${++ids}`;
  const now = () => new Date(clock);

  function field(model: string, row: Row, key: string, cond: unknown): boolean {
    if (key === "OR") {
      return (cond as Where[]).some((part) => matches(model, row, part));
    }
    if (key === "AND") {
      return (cond as Where[]).every((part) => matches(model, row, part));
    }
    if (key === "NOT") return !matches(model, row, cond as Where);
    if (model === "dayPlanItem" && key === "plan") {
      const plan = tables.dayPlan.find((p) => p.id === row.planId);
      return Boolean(plan) && matches("dayPlan", plan as Row, cond as Where);
    }
    if (key.includes("_") && isPlain(cond) && !(key in row)) {
      return Object.entries(cond).every(([part, value]) =>
        same(row[part], value)
      );
    }
    const value = row[key];
    if (!isPlain(cond)) return same(value, cond);
    return Object.entries(cond).every(([op, operand]) => {
      switch (op) {
        case "equals":
          return same(value, operand);
        case "in":
          return (operand as unknown[]).some((entry) => same(value, entry));
        case "notIn":
          return !(operand as unknown[]).some((entry) => same(value, entry));
        case "not":
          return isPlain(operand)
            ? !field(model, row, key, operand)
            : !same(value, operand);
        case "gte":
          return value != null && num(value) >= num(operand);
        case "gt":
          return value != null && num(value) > num(operand);
        case "lte":
          return value != null && num(value) <= num(operand);
        case "lt":
          return value != null && num(value) < num(operand);
        default:
          throw new Error(`fake db: unsupported operator ${op}`);
      }
    });
  }

  function matches(model: string, row: Row, where?: Where): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) =>
      field(model, row, key, cond)
    );
  }

  function shape(model: string, row: Row, args: Where = {}) {
    const out: Row = structuredClone(row);
    const include = args.include as Where | undefined;
    const select = args.select as Where | undefined;
    if (model === "dayPlan" && (include?.items || select?.items)) {
      const items = tables.dayPlanItem
        .filter((item) => item.planId === row.id)
        .sort((a, b) => num(a.position) - num(b.position))
        .map((item) => {
          const copy: Row = structuredClone(item);
          copy.task = structuredClone(
            tables.task.find((task) => task.id === item.taskId) ?? null
          );
          return copy;
        });
      out.items = items;
    }
    if (model === "dayPlanItem") {
      const plan = tables.dayPlan.find((p) => p.id === row.planId);
      out.plan = plan ? structuredClone(plan) : null;
    }
    return out;
  }

  function rowsOf(model: string, args: Where = {}) {
    let rows = tables[model].filter((row) =>
      matches(model, row, args.where as Where)
    );
    const orderBy = args.orderBy as Where | Where[] | undefined;
    if (orderBy) {
      const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
      rows = [...rows].sort((a, b) => {
        for (const spec of specs) {
          const [key, dir] = Object.entries(spec)[0] as [string, string];
          const delta = num(a[key]) - num(b[key]);
          if (delta !== 0) return dir === "desc" ? -delta : delta;
        }
        return 0;
      });
    }
    const cursor = args.cursor as { id: string } | undefined;
    if (cursor) {
      const at = rows.findIndex((row) => row.id === cursor.id);
      rows = rows.slice(at + 1);
    }
    if (typeof args.take === "number") rows = rows.slice(0, args.take);
    return rows;
  }

  function create(model: string, data: Where): Row {
    const { activities, ...rest } = data;
    const unique = UNIQUE[model];
    if (
      unique &&
      tables[model].some((row) =>
        unique.every((key) => same(row[key], rest[key]))
      )
    ) {
      throw Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
      });
    }
    const row: Row = {
      id: nextId(model),
      createdAt: now(),
      updatedAt: now(),
      ...(DEFAULTS[model]?.() ?? {}),
      ...rest,
    };
    if (model === "task") {
      row.activities = Array.isArray(activities)
        ? activities
        : activities
          ? [{ createdAt: now() }]
          : [];
    }
    tables[model].push(row);
    return row;
  }

  function update(model: string, row: Row, data: Where) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) row[key] = value;
    }
    row.updatedAt = now();
  }

  const delegate = (model: string) => ({
    findMany: async (args: Where = {}) =>
      rowsOf(model, args).map((row) => shape(model, row, args)),
    findFirst: async (args: Where = {}) => {
      const row = rowsOf(model, args)[0];
      return row ? shape(model, row, args) : null;
    },
    findUnique: async (args: Where) => {
      const row = tables[model].find((candidate) =>
        matches(model, candidate, args.where as Where)
      );
      return row ? shape(model, row, args) : null;
    },
    create: async (args: Where) =>
      shape(model, create(model, args.data as Where), args),
    update: async (args: Where) => {
      const row = tables[model].find((candidate) =>
        matches(model, candidate, args.where as Where)
      );
      if (!row) throw new Error(`fake db: ${model} not found`);
      update(model, row, args.data as Where);
      return shape(model, row, args);
    },
    updateMany: async (args: Where) => {
      const rows = tables[model].filter((row) =>
        matches(model, row, args.where as Where)
      );
      for (const row of rows) update(model, row, args.data as Where);
      return { count: rows.length };
    },
    deleteMany: async (args: Where) => {
      const keep = tables[model].filter(
        (row) => !matches(model, row, args.where as Where)
      );
      const count = tables[model].length - keep.length;
      tables[model] = keep;
      return { count };
    },
    upsert: async (args: Where) => {
      const row = tables[model].find((candidate) =>
        matches(model, candidate, args.where as Where)
      );
      if (row) {
        update(model, row, args.update as Where);
        return shape(model, row, args);
      }
      return shape(model, create(model, args.create as Where), args);
    },
  });

  const client: Record<string, unknown> = {};
  for (const model of Object.keys(tables)) client[model] = delegate(model);
  client.$transaction = async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => Promise<unknown>)(client)
      : Promise.all(arg as Promise<unknown>[]);

  return {
    client,
    tables,
    now,
    advance: (ms: number) => {
      clock += ms;
    },
    insert: (model: string, data: Where) => create(model, data),
  };
}

export type DayPlanDb = ReturnType<typeof createDayPlanDb>;
