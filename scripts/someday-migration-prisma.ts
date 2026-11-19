/**
 * The Prisma client the bundled Someday migration script uses in place of
 * `@/lib/prisma` (see `build:scripts`). `log: []` keeps Prisma from printing
 * query text or error messages, which can carry ids, so nothing identifying
 * reaches stdout or stderr. DATABASE_URL is read by Prisma itself.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({ log: [] });
