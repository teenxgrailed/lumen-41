"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { formatDateOnlyWithWeekday } from "@/lib/date-utils";
import {
  type IdeaCardData,
  type IdeaTakeResult,
  useIdeaCards,
} from "@/lib/needt3/hooks/ideas";
import { failureLine } from "@/lib/needt3/idea-notice";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { IdeaSlot } from "./IdeaCard";
import type { IdeaPhase } from "./IdeaCard";
import { IDEA_COPY } from "./copy";

/** A card the person answered: kept here after the server stops sending it. */
interface Settled {
  card: IdeaCardData;
  phase: IdeaPhase;
  actionId: string | null;
  took: IdeaTakeResult | null;
}

export interface IdeaSlots {
  /** Any card, or any answered card still folding away. */
  any: boolean;
  /**
   * The slots that sit after the `n`th visible row of a list of `total`.
   * `after` past the end clamps to the end; a list with no rows takes them at 0.
   */
  after: (n: number, total: number) => ReactNode;
}

/** Where the task went, in the person's words. */
function addedLine(took: IdeaTakeResult | null): string {
  if (!took) return IDEA_COPY.added;
  if (took.placed?.today) return IDEA_COPY.addedToday;
  if (took.day)
    return IDEA_COPY.addedLater(formatDateOnlyWithWeekday(took.day));
  return IDEA_COPY.added;
}

/**
 * THE IDEA CARDS ON TODAY (phone). The data and the rules are the server's
 * (`useIdeaCards`: at most two a day, the same on every device); this keeps what
 * the screen does with them: each card's four states (the card, after Take,
 * after Skip, gone), Undo, and counting a card as shown only when it is really
 * on screen.
 *
 *   const ideas = useIdeaSlots({ day: today, visibleTasks: rows, renderTaken });
 *   // between rows:  {ideas.after(n, rows)}
 *
 * `visibleTasks` is read once, when the screen first has its rows, so a task
 * checked off does not ask the server again and move the card.
 */
export function useIdeaSlots({
  day,
  visibleTasks,
  enabled,
  renderTaken,
}: {
  day: string;
  visibleTasks: number;
  enabled: boolean;
  /** The row of the task a card became, if the screen already has it. */
  renderTaken?: (taskId: string) => ReactNode;
}): IdeaSlots {
  const qc = useQueryClient();
  const frozen = useRef<number | null>(null);
  if (enabled && frozen.current === null) frozen.current = visibleTasks;
  const ideas = useIdeaCards({
    day,
    surface: "today",
    visibleTasks: frozen.current ?? undefined,
    enabled,
  });
  const [settled, setSettled] = useState<Record<string, Settled>>({});
  // Cards whose Undo the server has not finished: they cannot be answered yet.
  const [restoring, setRestoring] = useState<Record<string, true>>({});
  const { markShown } = ideas;

  const patch = useCallback((id: string, next: Partial<Settled>) => {
    setSettled((s) => (s[id] ? { ...s, [id]: { ...s[id], ...next } } : s));
  }, []);
  const drop = useCallback((id: string) => {
    setSettled((s) => {
      if (!s[id]) return s;
      const rest = { ...s };
      delete rest[id];
      return rest;
    });
  }, []);
  const planAgain = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.dayPlan() });
  }, [qc]);

  const take = useCallback(
    async (card: IdeaCardData) => {
      setSettled((s) => ({
        ...s,
        [card.id]: { card, phase: "took", actionId: null, took: null },
      }));
      try {
        const written = await ideas.take(card.id);
        patch(card.id, {
          actionId: written.actionId,
          took: written.result,
        });
        planAgain();
      } catch {
        drop(card.id);
        notify.error("Could not take that idea", {
          dedupeKey: `idea-take-${card.id}`,
        });
      }
    },
    [ideas, patch, drop, planAgain]
  );

  const skip = useCallback(
    async (card: IdeaCardData) => {
      setSettled((s) => ({
        ...s,
        [card.id]: { card, phase: "skipped", actionId: null, took: null },
      }));
      try {
        const written = await ideas.skip(card.id);
        patch(card.id, { actionId: written.actionId });
      } catch {
        drop(card.id);
        notify.error("Could not skip that idea", {
          dedupeKey: `idea-skip-${card.id}`,
        });
      }
    },
    [ideas, patch, drop]
  );

  const undo = useCallback(
    async (entry: Settled) => {
      const { card, actionId } = entry;
      if (!actionId) return;
      // The card comes back at once; the server's undo follows.
      patch(card.id, { phase: "idea", actionId: null, took: null });
      setRestoring((r) => ({ ...r, [card.id]: true }));
      try {
        await ideas.undo(actionId);
        planAgain();
      } catch (error) {
        patch(card.id, { ...entry });
        notify.error(failureLine(error), {
          dedupeKey: `idea-undo-${card.id}`,
        });
      } finally {
        setRestoring((r) => {
          const rest = { ...r };
          delete rest[card.id];
          return rest;
        });
      }
    },
    [ideas, patch, planAgain]
  );

  // The server's cards, with the answered ones kept in their place.
  const live = ideas.cards.filter((c) => !settled[c.id]);
  const entries: { card: IdeaCardData; entry: Settled | null }[] = [
    ...live.map((card) => ({ card, entry: null })),
    ...Object.values(settled).map((entry) => ({ card: entry.card, entry })),
  ].sort((a, b) => a.card.after - b.card.after);

  const after = (n: number, total: number): ReactNode => {
    const mine = entries.filter(({ card }) => {
      const at = Math.min(Math.max(card.after, total ? 1 : 0), total);
      return at === n;
    });
    if (!mine.length) return null;
    return mine.map(({ card, entry }) => {
      const phase: IdeaPhase = entry?.phase ?? "idea";
      return (
        <IdeaSlot
          key={card.id}
          card={card}
          phase={phase}
          busy={ideas.taking || ideas.skipping || !!restoring[card.id]}
          taken={
            entry?.took && renderTaken ? renderTaken(entry.took.task.id) : null
          }
          addedLine={addedLine(entry?.took ?? null)}
          onSeen={() => void markShown(card)}
          onTake={() => void take(card)}
          onSkip={() => void skip(card)}
          canUndo={!!entry?.actionId}
          onUndo={() => (entry ? void undo(entry) : undefined)}
          onSettled={() =>
            entry ? patch(card.id, { phase: "gone" }) : undefined
          }
        />
      );
    });
  };

  return { any: entries.length > 0, after };
}
