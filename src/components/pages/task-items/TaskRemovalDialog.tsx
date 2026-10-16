"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The words of the prompt, for one task or several. Pure, so they are tested. */
export function removalCopy(titles: readonly (string | null)[]) {
  const n = titles.length;
  const first = titles[0]?.trim();
  if (n === 1) {
    return {
      title: "Delete the task too?",
      body: first
        ? `You removed “${first}” from the page. Delete its task, or keep it in Tasks?`
        : "You removed a task from the page. Delete it, or keep it in Tasks?",
      del: "Delete task",
      keep: "Keep task",
    };
  }
  return {
    title: `Delete ${n} tasks too?`,
    body: `You removed ${n} tasks from the page. Delete them, or keep them in Tasks?`,
    del: `Delete ${n} tasks`,
    keep: "Keep tasks",
  };
}

/**
 * Taking a task item out of a page asks what happens to its task: the page's
 * line is gone either way, the task is deleted (moved to Trash) or kept.
 * Closing the prompt keeps it: nothing is deleted without a clear yes.
 */
export function TaskRemovalDialog({
  titles,
  onKeep,
  onDelete,
}: {
  /** The titles of the removed tasks; empty when nothing is pending. */
  titles: readonly (string | null)[];
  onKeep: () => void;
  onDelete: () => void;
}) {
  const open = titles.length > 0;
  const copy = removalCopy(titles);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <DialogContent className="sm:max-w-md" data-task-removal="">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeep}>
            {copy.keep}
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete}>
            {copy.del}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
