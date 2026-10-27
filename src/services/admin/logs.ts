import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface AdminLogQuery {
  page: number;
  limit: number;
  level?: string | null;
  source?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

/** The filter the admin log viewer applies, as a Prisma where clause. */
export function adminLogWhere(query: AdminLogQuery): Prisma.LogWhereInput {
  const where: Prisma.LogWhereInput = {};
  if (query.level) where.level = query.level;
  if (query.source) where.source = query.source;
  if (query.from || query.to) {
    where.timestamp = {};
    if (query.from) where.timestamp.gte = new Date(query.from);
    if (query.to) where.timestamp.lte = new Date(query.to);
  }
  if (query.search) {
    where.OR = [
      { message: { contains: query.search, mode: "insensitive" } },
      { source: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

/**
 * One page of the application log, newest first: what the admin log viewer
 * (`GET /api/logs`) and the read-only MCP admin tools both show.
 */
export async function queryAdminLogs(query: AdminLogQuery) {
  const where = adminLogWhere(query);
  const [total, logs] = await Promise.all([
    prisma.log.count({ where }),
    prisma.log.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return {
    logs,
    pagination: {
      total,
      pages: Math.ceil(total / query.limit),
      current: query.page,
      limit: query.limit,
    },
  };
}
