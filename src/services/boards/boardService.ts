import { Prisma } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import {
  POSITION_STEP,
  initialPositions,
  movePosition,
} from "@/lib/board-position";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "boardService";

const boardWithColumns = {
  columns: { orderBy: { position: "asc" } },
} satisfies Prisma.BoardInclude;

export async function listBoards(userId: string) {
  return prisma.board.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: boardWithColumns,
  });
}

export async function getBoard(userId: string, boardId: string) {
  return prisma.board.findFirst({
    where: { id: boardId, userId },
    include: {
      columns: { orderBy: { position: "asc" } },
      tasks: {
        orderBy: { boardPosition: "asc" },
        include: { tags: true },
      },
    },
  });
}

/**
 * Create a board. Optional `columns` seed the initial columns (used by the
 * "Start empty" flow with no columns, or by templates / the AI scaffolder).
 */
export async function createBoard(
  userId: string,
  input: { name: string; icon?: string | null; columns?: string[] }
) {
  const last = await prisma.board.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + POSITION_STEP;

  const columnNames = input.columns ?? [];
  const columnPositions = initialPositions(columnNames.length);

  const board = await prisma.board.create({
    data: {
      userId,
      name: input.name.trim() || "Untitled board",
      icon: input.icon ?? null,
      position,
      columns: {
        create: columnNames.map((name, index) => ({
          name,
          position: columnPositions[index],
        })),
      },
    },
    include: boardWithColumns,
  });

  logger.info("Created board", { boardId: board.id }, LOG_SOURCE);
  return board;
}

export async function updateBoard(
  userId: string,
  boardId: string,
  updates: {
    name?: string;
    icon?: string | null;
    groupBy?: string;
    position?: number;
  }
) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!board) return null;

  return prisma.board.update({
    where: { id: boardId },
    data: {
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
      ...(updates.groupBy !== undefined ? { groupBy: updates.groupBy } : {}),
      ...(updates.position !== undefined ? { position: updates.position } : {}),
    },
    include: boardWithColumns,
  });
}

export async function deleteBoard(userId: string, boardId: string) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!board) return null;
  // Cascade removes columns; task.boardId/boardColumnId are set null by FK.
  await prisma.board.delete({ where: { id: boardId } });
  return { id: boardId };
}

export async function createColumn(
  userId: string,
  boardId: string,
  input: { name: string; color?: string | null }
) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!board) return null;

  const last = await prisma.boardColumn.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.boardColumn.create({
    data: {
      boardId,
      name: input.name.trim() || "New column",
      color: input.color ?? null,
      position: (last?.position ?? 0) + POSITION_STEP,
    },
  });
}

/** Verify the column belongs to a board owned by the user. */
async function ownsColumn(userId: string, columnId: string) {
  return prisma.boardColumn.findFirst({
    where: { id: columnId, board: { userId } },
    select: { id: true, boardId: true },
  });
}

export async function updateColumn(
  userId: string,
  columnId: string,
  updates: { name?: string; color?: string | null; position?: number }
) {
  const column = await ownsColumn(userId, columnId);
  if (!column) return null;

  return prisma.boardColumn.update({
    where: { id: columnId },
    data: {
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.color !== undefined ? { color: updates.color } : {}),
      ...(updates.position !== undefined ? { position: updates.position } : {}),
    },
  });
}

export async function deleteColumn(userId: string, columnId: string) {
  const column = await ownsColumn(userId, columnId);
  if (!column) return null;
  // Detach any cards from the column; the tasks themselves are preserved.
  await prisma.task.updateMany({
    where: { boardColumnId: columnId },
    data: { boardColumnId: null, boardPosition: null },
  });
  await prisma.boardColumn.delete({ where: { id: columnId } });
  return { id: columnId, boardId: column.boardId };
}

/**
 * Reorder a column to `toIndex` among its siblings using fractional indexing —
 * only the moved column's position is rewritten.
 */
export async function reorderColumn(
  userId: string,
  columnId: string,
  toIndex: number
) {
  const column = await ownsColumn(userId, columnId);
  if (!column) return null;

  const siblings = await prisma.boardColumn.findMany({
    where: { boardId: column.boardId, NOT: { id: columnId } },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  const position = movePosition(
    siblings.map((s) => s.position),
    toIndex
  );
  return prisma.boardColumn.update({
    where: { id: columnId },
    data: { position },
  });
}

/**
 * Move a card (task) into `columnId` at `toIndex`, or reorder within its
 * column. Returns the updated task. Only the moved card's position changes.
 */
export async function moveCard(
  userId: string,
  input: { taskId: string; boardId: string; columnId: string; toIndex: number }
) {
  const [task, board, column] = await Promise.all([
    prisma.task.findFirst({
      where: { id: input.taskId, userId },
      select: { id: true },
    }),
    prisma.board.findFirst({
      where: { id: input.boardId, userId },
      select: { id: true },
    }),
    prisma.boardColumn.findFirst({
      where: { id: input.columnId, boardId: input.boardId },
      select: { id: true },
    }),
  ]);
  if (!task || !board || !column) return null;

  const siblings = await prisma.task.findMany({
    where: { boardColumnId: input.columnId, NOT: { id: input.taskId } },
    orderBy: { boardPosition: "asc" },
    select: { boardPosition: true },
  });
  const boardPosition = movePosition(
    siblings.map((s) => s.boardPosition ?? 0),
    input.toIndex
  );

  return prisma.task.update({
    where: { id: input.taskId },
    data: {
      boardId: input.boardId,
      boardColumnId: input.columnId,
      boardPosition,
    },
  });
}

/** Add a card to a column by creating a minimal task bound to the board. */
export async function addCard(
  userId: string,
  input: { boardId: string; columnId: string; title: string }
) {
  const column = await prisma.boardColumn.findFirst({
    where: { id: input.columnId, boardId: input.boardId, board: { userId } },
    select: { id: true, board: { select: { workspaceId: true } } },
  });
  if (!column) return null;

  const last = await prisma.task.findFirst({
    where: { boardColumnId: input.columnId },
    orderBy: { boardPosition: "desc" },
    select: { boardPosition: true },
  });

  const card = await prisma.task.create({
    data: {
      title: input.title.trim() || "Untitled",
      status: "todo",
      userId,
      workspaceId: column.board.workspaceId,
      assigneeId: userId,
      boardId: input.boardId,
      boardColumnId: input.columnId,
      boardPosition: (last?.boardPosition ?? 0) + POSITION_STEP,
      createdAt: newDate(),
      ...(column.board.workspaceId && {
        activities: {
          create: {
            workspaceId: column.board.workspaceId,
            actorId: userId,
            action: "CREATED",
          },
        },
      }),
    },
  });
  recordActivation("task_created", userId, { source: "board" });
  return card;
}
