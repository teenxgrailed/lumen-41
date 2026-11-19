import { prisma } from "@/lib/prisma";

import { requireDateKey } from "./rules";

const NOTE_MAX = 5_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function noteLines(note: string): string[] {
  return note
    .slice(0, NOTE_MAX)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Adds the evening note to that day's `DailyAgenda`, after what is there. It
 * never replaces the day's document, so a note saved through the API or a
 * channel cannot wipe a day the person wrote. The agenda is where the note
 * lives; no separate prose storage exists.
 */
export async function appendEveningNote(
  userId: string,
  dayKey: string,
  note: string
): Promise<void> {
  const date = requireDateKey(dayKey);
  const lines = noteLines(note);
  if (lines.length === 0) return;

  const current = await prisma.dailyAgenda.findUnique({
    where: { userId_date: { userId, date } },
    select: { content: true, documentFormatVersion: true },
  });
  const content = current?.content ?? "";

  let next: string;
  if (content.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as {
        document?: { type?: string; content?: unknown[] };
      };
      if (
        parsed.document?.type === "doc" &&
        Array.isArray(parsed.document.content)
      ) {
        parsed.document.content.push(
          ...lines.map((line) => ({
            type: "paragraph",
            content: [{ type: "text", text: line }],
          }))
        );
        next = JSON.stringify(parsed);
      } else {
        next = content + lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
      }
    } catch {
      next = content + lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
    }
  } else {
    next = content + lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  }

  await prisma.dailyAgenda.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      content: next,
      documentFormatVersion: current?.documentFormatVersion ?? 1,
    },
    update: { content: next },
  });
}
