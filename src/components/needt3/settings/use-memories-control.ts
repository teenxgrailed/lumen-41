"use client";

import { useState } from "react";

import {
  type Memory,
  useMemories,
  useMemoryActions,
} from "@/lib/needt3/hooks/memories";
import { notify } from "@/lib/notifications";

export const SOURCE_LABEL: Record<Memory["source"], string> = {
  chat: "You told Ask",
  inferred: "Learned",
  habit: "Your work habits",
  document: "Your documents",
  mail: "Your mail subjects",
};

export const memoryDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const fail = (error: unknown) =>
  notify.error(
    error instanceof Error ? error.message : "Could not save that change."
  );

/**
 * The behaviour of Settings, Memories, shared by the desktop group and the
 * phone one: the switch (asking keep or delete when it is turned off with
 * memories on the list), inline edit, delete and Forget all.
 */
export function useMemoriesControl() {
  const state = useMemories();
  const { setEnabled, edit, forget } = useMemoryActions();
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null
  );

  const enabled = state.data?.enabled === true;
  const memories = state.data?.memories ?? [];

  const turn = (on: boolean) => {
    if (!on && memories.length > 0) {
      setAsking(true);
      return;
    }
    setEnabled.mutate({ enabled: on }, { onError: fail });
  };
  const turnOff = (keep: boolean) => {
    setAsking(false);
    setEnabled.mutate(
      { enabled: false, memories: keep ? "keep" : "delete" },
      { onError: fail }
    );
  };
  const save = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (text.length < 3) return;
    edit.mutate(
      { memoryId: editing.id, content: text },
      { onSuccess: () => setEditing(null), onError: fail }
    );
  };
  const remove = (memoryId: string) =>
    forget.mutate({ memoryId }, { onError: fail });
  const forgetAll = () => forget.mutate({ all: true }, { onError: fail });

  return {
    loaded: !!state.data,
    enabled,
    memories,
    switching: setEnabled.isPending,
    forgetting: forget.isPending,
    saving: edit.isPending,
    asking,
    cancelAsking: () => setAsking(false),
    editing,
    setEditing,
    turn,
    turnOff,
    save,
    remove,
    forgetAll,
  };
}
