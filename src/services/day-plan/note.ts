import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { requireDateKey } from "./rules";

const NOTE_MAX = 5_000;
const LOG_SOURCE = "DayPlanNote";

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

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function paragraphText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const { text, content } = node as { text?: unknown; content?: unknown };
  if (typeof text === "string") return text;
  return Array.isArray(content) ? content.map(paragraphText).join("") : "";
}

/** The lines already in a day's document, as plain trimmed text. */
export function existingLines(content: string): Set<string> {
  const lines = new Set<string>();
  if (content.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as {
        document?: { content?: unknown[] };
      };
      for (const node of parsed.document?.content ?? []) {
        const text = paragraphText(node).trim();
        if (text) lines.add(text);
      }
      return lines;
    } catch {
      // Not a document: read it as HTML below.
    }
  }
  for (const match of content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = unescapeHtml(match[1].replace(/<[^>]*>/g, "")).trim();
    if (text) lines.add(text);
  }
  return lines;
}

function appended(content: string, lines: string[]): string {
  const html = () =>
    content + lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  if (!content.trim().startsWith("{")) return html();
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
      return JSON.stringify(parsed);
    }
  } catch {
    // Fall through: keep what is there and add HTML after it.
  }
  return html();
}

/**
 * Adds the evening note to that day's `DailyAgenda`, after what is there. It
 * never replaces the day's document, so a note saved through the API or a
 * channel cannot wipe a day the person wrote. Lines already in the document are
 * skipped, so the same note twice adds nothing. The write is conditional on the
 * row's `updatedAt`: if the person saved the day in between, it reads again and
 * tries once more rather than overwriting their text. The agenda is where the
 * note lives; no separate prose storage exists.
 */
export async function appendEveningNote(
  userId: string,
  dayKey: string,
  note: string
): Promise<void> {
  const date = requireDateKey(dayKey);
  const lines = noteLines(note);
  if (lines.length === 0) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await prisma.dailyAgenda.findUnique({
      where: { userId_date: { userId, date } },
      select: { content: true, documentFormatVersion: true, updatedAt: true },
    });
    const content = current?.content ?? "";
    const present = existingLines(content);
    const fresh = lines.filter((line) => !present.has(line));
    if (fresh.length === 0) return;
    const next = appended(content, fresh);

    if (!current) {
      try {
        await prisma.dailyAgenda.create({
          data: { userId, date, content: next, documentFormatVersion: 1 },
        });
        return;
      } catch {
        // Somebody created the day first: read it and append after it.
        continue;
      }
    }
    const written = await prisma.dailyAgenda.updateMany({
      where: { userId, date, updatedAt: current.updatedAt },
      data: { content: next },
    });
    if (written.count > 0) return;
  }
  // The day kept changing under us. The note still becomes tasks; losing the
  // agenda line is better than overwriting what the person wrote.
  logger.warn(
    "Evening note not appended: the day kept changing",
    {},
    LOG_SOURCE
  );
}
