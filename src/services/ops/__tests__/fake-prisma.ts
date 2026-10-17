/**
 * A small in-memory stand-in for the Prisma calls the ops make. It models only
 * the filters and writes src/services/ops uses, so the tests exercise real op
 * and undo logic against state instead of asserting on mock call shapes.
 */
type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const RELATIONS: Record<
  string,
  Record<string, { model: string; key: string }>
> = {
  scheduledBlock: { task: { model: "task", key: "taskId" } },
};
const CHILDREN: Record<
  string,
  Record<string, { model: string; foreignKey: string; orderBy?: string }>
> = {
  task: {
    scheduledBlocks: {
      model: "scheduledBlock",
      foreignKey: "taskId",
      orderBy: "chunkIndex",
    },
    attachments: {
      model: "taskAttachment",
      foreignKey: "taskId",
      orderBy: "createdAt",
    },
  },
};
const HAS_UPDATED_AT = new Set([
  "task",
  "project",
  "habit",
  "scheduledBlock",
  "calendarEvent",
  "page",
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}

function same(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  return a === b;
}

function compare(a: unknown, b: unknown) {
  const left = a instanceof Date ? a.getTime() : (a as number);
  const right = b instanceof Date ? b.getTime() : (b as number);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createFakePrisma() {
  const tables: Record<string, Row[]> = {
    task: [],
    project: [],
    scheduledBlock: [],
    tag: [],
    habit: [],
    habitCompletion: [],
    agentAction: [],
    agentRun: [],
    userSettings: [],
    connectorSettings: [],
    taskReminder: [],
    taskAttachment: [],
    workSchedule: [],
    calendarEvent: [],
    calendarFeed: [],
    page: [],
  };
  let clock = Date.parse("2026-10-01T00:00:00.000Z");
  let ids = 0;
  const tick = () => new Date((clock += 1));
  const nextId = (model: string) => `${model}-${++ids}`;

  function matchField(
    model: string,
    row: Row,
    key: string,
    condition: unknown
  ): boolean {
    if (key === "OR") {
      return (condition as Where[]).some((part) => matches(model, row, part));
    }
    if (key === "AND") {
      return (condition as Where[]).every((part) => matches(model, row, part));
    }
    const relation = RELATIONS[model]?.[key];
    if (relation) {
      const parent = tables[relation.model].find(
        (candidate) => candidate.id === row[relation.key]
      );
      return (
        Boolean(parent) && matches(relation.model, parent!, condition as Where)
      );
    }
    const child = CHILDREN[model]?.[key];
    if (child && isPlainObject(condition) && "some" in condition) {
      return tables[child.model].some(
        (candidate) =>
          candidate[child.foreignKey] === row.id &&
          matches(child.model, candidate, condition.some as Where)
      );
    }
    if (key.includes("_") && isPlainObject(condition) && !(key in row)) {
      // Compound unique key, e.g. habitId_date.
      return Object.entries(condition).every(([part, value]) =>
        same(row[part], value)
      );
    }
    const value = row[key];
    if (!isPlainObject(condition)) return same(value ?? null, condition);
    return Object.entries(condition).every(([operator, operand]) => {
      switch (operator) {
        case "in":
          return (operand as unknown[]).some((entry) => same(value, entry));
        case "not":
          return isPlainObject(operand)
            ? !matchField(model, row, key, operand)
            : !same(value ?? null, operand);
        case "gte":
          return value != null && compare(value, operand) >= 0;
        case "gt":
          return value != null && compare(value, operand) > 0;
        case "lte":
          return value != null && compare(value, operand) <= 0;
        case "lt":
          return value != null && compare(value, operand) < 0;
        case "contains":
          return String(value ?? "")
            .toLowerCase()
            .includes(String(operand).toLowerCase());
        case "equals":
          return same(value, operand);
        case "mode":
          return true;
        default:
          throw new Error(`fake prisma: unsupported operator ${operator}`);
      }
    });
  }

  function matches(model: string, row: Row, where: Where | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, condition]) =>
      matchField(model, row, key, condition)
    );
  }

  function shape(model: string, row: Row, args: Where = {}) {
    let out: Record<string, unknown> = clone(row);
    const include = args.include as Where | undefined;
    for (const [key, spec] of Object.entries(include ?? {})) {
      const child = CHILDREN[model]?.[key];
      if (child) {
        out[key] = tables[child.model]
          .filter((candidate) => candidate[child.foreignKey] === row.id)
          .sort((a, b) =>
            child.orderBy ? compare(a[child.orderBy], b[child.orderBy]) : 0
          )
          .map((candidate) => clone(candidate));
      } else if (model === "task" && key === "project") {
        const project = tables.project.find(
          (candidate) => candidate.id === row.projectId
        );
        out.project = project ? clone(project) : null;
      } else if (key === "tags") {
        out.tags = ((row.tags as { id: string }[]) ?? []).map((tag) => ({
          id: tag.id,
        }));
      } else if (spec) {
        out[key] = null;
      }
    }
    const select = args.select as Where | undefined;
    if (select) {
      out = Object.fromEntries(
        Object.keys(select)
          .filter((key) => select[key])
          .map((key) => [key, out[key] ?? null])
      );
    }
    return out;
  }

  function applyData(model: string, row: Row, data: Where) {
    for (const [key, value] of Object.entries(data)) {
      if (key === "activities" || value === undefined) continue;
      if (key === "tags" && isPlainObject(value)) {
        let tags = (row.tags as { id: string }[]) ?? [];
        if (value.set)
          tags = (value.set as { id: string }[]).map(({ id }) => ({ id }));
        if (value.connect) {
          tags = [...tags, ...(value.connect as { id: string }[])];
        }
        row.tags = tags;
        continue;
      }
      row[key] = value instanceof Date ? new Date(value) : clone(value);
    }
    if (HAS_UPDATED_AT.has(model)) row.updatedAt = tick();
  }

  function sortRows(rows: Row[], orderBy: unknown) {
    const orders = (
      Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
    ) as Where[];
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [key, direction] = Object.entries(order)[0];
        const left = a[key];
        const right = b[key];
        if (left == null && right == null) continue;
        if (left == null) return 1;
        if (right == null) return -1;
        const result = compare(left, right);
        if (result) return direction === "desc" ? -result : result;
      }
      return 0;
    });
  }

  function delegate(model: string) {
    const table = () => tables[model];
    const defaults = (): Row => {
      const now = tick();
      const base: Row = { id: nextId(model), createdAt: now };
      if (HAS_UPDATED_AT.has(model)) base.updatedAt = now;
      if (model === "task") {
        Object.assign(base, {
          description: null,
          status: "todo",
          dueDate: null,
          deadline: null,
          priorityLevel: "MEDIUM",
          projectId: null,
          estimatedMinutes: null,
          duration: null,
          scheduledStart: null,
          scheduledEnd: null,
          scheduleScore: null,
          lastScheduled: null,
          isAutoScheduled: false,
          autoScheduled: false,
          scheduleLocked: false,
          isArchived: false,
          archivedAt: null,
          completedAt: null,
          isRecurring: false,
          recurrenceRule: null,
          assigneeId: null,
          workspaceId: null,
          userId: null,
          tags: [],
        });
      }
      if (model === "project") {
        Object.assign(base, {
          status: "active",
          description: null,
          color: null,
          icon: null,
        });
      }
      if (model === "calendarEvent") {
        Object.assign(base, {
          description: null,
          location: null,
          allDay: false,
          archivedAt: null,
        });
      }
      if (model === "agentAction") {
        Object.assign(base, {
          runId: null,
          before: null,
          inverse: null,
          targetVersions: [],
          status: "applied",
          undoableUntil: null,
          undoneAt: null,
          undoneVersions: null,
          error: null,
        });
      }
      if (model === "agentRun") Object.assign(base, { finishedAt: null });
      return base;
    };

    return {
      findFirst: async (args: Where = {}) => {
        const rows = sortRows(
          table().filter((row) => matches(model, row, args.where as Where)),
          args.orderBy
        );
        return rows[0] ? shape(model, rows[0], args) : null;
      },
      findUnique: async (args: Where = {}) => {
        const row = table().find((candidate) =>
          matches(model, candidate, args.where as Where)
        );
        return row ? shape(model, row, args) : null;
      },
      findMany: async (args: Where = {}) => {
        const rows = sortRows(
          table().filter((row) => matches(model, row, args.where as Where)),
          args.orderBy
        );
        const limited = args.take ? rows.slice(0, args.take as number) : rows;
        return limited.map((row) => shape(model, row, args));
      },
      count: async (args: Where = {}) =>
        table().filter((row) => matches(model, row, args.where as Where))
          .length,
      create: async (args: Where) => {
        const row = defaults();
        applyData(model, row, args.data as Where);
        table().push(row);
        return shape(model, row, args);
      },
      createMany: async (args: Where) => {
        for (const data of args.data as Where[]) {
          const row = defaults();
          applyData(model, row, data);
          table().push(row);
        }
        return { count: (args.data as Where[]).length };
      },
      update: async (args: Where) => {
        const row = table().find((candidate) =>
          matches(model, candidate, args.where as Where)
        );
        if (!row) throw new Error(`fake prisma: ${model} not found`);
        applyData(model, row, args.data as Where);
        return shape(model, row, args);
      },
      updateMany: async (args: Where) => {
        const rows = table().filter((row) =>
          matches(model, row, args.where as Where)
        );
        rows.forEach((row) => applyData(model, row, args.data as Where));
        return { count: rows.length };
      },
      upsert: async (args: Where) => {
        const row = table().find((candidate) =>
          matches(model, candidate, args.where as Where)
        );
        if (row) {
          applyData(model, row, args.update as Where);
          return shape(model, row, args);
        }
        const created = defaults();
        applyData(model, created, args.create as Where);
        table().push(created);
        return shape(model, created, args);
      },
      deleteMany: async (args: Where = {}) => {
        const keep = table().filter(
          (row) => !matches(model, row, args.where as Where)
        );
        const count = table().length - keep.length;
        tables[model] = keep;
        return { count };
      },
    };
  }

  const client: Record<string, unknown> = {};
  for (const model of Object.keys(tables)) client[model] = delegate(model);
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    // Roll back on throw, like a real transaction.
    const snapshot = clone(tables);
    try {
      return await fn(client);
    } catch (error) {
      for (const key of Object.keys(tables)) tables[key] = snapshot[key];
      throw error;
    }
  };

  return {
    client,
    tables,
    tick,
    /** Inserts a row with the model's defaults; `row` may set the id. */
    seed(model: string, row: Partial<Row>) {
      const created = (
        client[model] as { create: (args: Where) => Promise<Row> }
      ).create({ data: row });
      return created;
    },
  };
}
