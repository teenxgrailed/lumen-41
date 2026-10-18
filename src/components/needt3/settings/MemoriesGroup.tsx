"use client";

import { useState } from "react";

import {
  type Memory,
  useMemories,
  useMemoryActions,
} from "@/lib/needt3/hooks/memories";
import { notify } from "@/lib/notifications";

import { SBtn, SGroup, SRow, V3Switch } from "./kit";

const SOURCE_LABEL: Record<Memory["source"], string> = {
  chat: "You told Ask",
  inferred: "Learned",
  habit: "Your work habits",
  document: "Your documents",
  mail: "Your mail subjects",
};

const day = (iso: string) =>
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
 * Settings, Memories. The switch is off until the person turns it on; off
 * means nothing is learned and nothing learned is used. Turning it off with
 * memories on the list asks whether to keep or delete them. The list is
 * readable either way, and every line can be edited or deleted.
 */
export function MemoriesGroup() {
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

  return (
    <SGroup
      title="Memories"
      hint="What Needt knows about you, so Ask and the planner fit you better."
    >
      <SRow
        title="Let Needt learn about me"
        desc="Learns your work habits from your tasks, the preferences you tell Ask, and short facts from your documents and mail subjects. Never mail bodies. Off, nothing is learned and nothing learned is used."
      >
        <V3Switch
          label="Let Needt learn about me"
          checked={enabled}
          disabled={!state.data || setEnabled.isPending}
          onChange={turn}
        />
      </SRow>
      {asking ? (
        <SRow
          title="Keep what Needt learned?"
          desc={`${memories.length} ${memories.length === 1 ? "memory" : "memories"}. Kept, they stay on this list but nothing uses them.`}
        >
          <SBtn onClick={() => turnOff(true)}>Keep them</SBtn>
          <SBtn tone="danger" onClick={() => turnOff(false)}>
            Delete them
          </SBtn>
          <SBtn onClick={() => setAsking(false)}>Cancel</SBtn>
        </SRow>
      ) : null}
      {state.data && memories.length === 0 ? (
        <SRow
          title="Nothing learned yet"
          desc={
            enabled
              ? "Habits appear after you finish some tasks. Tell Ask a preference and it shows up here."
              : "Turn the switch on and what Needt learns will be listed here."
          }
        />
      ) : null}
      {memories.map((memory) =>
        editing?.id === memory.id ? (
          <SRow key={memory.id} title="Edit memory">
            <input
              className="pl-field"
              aria-label="Memory"
              maxLength={500}
              value={editing.text}
              autoFocus
              onChange={(e) =>
                setEditing({ id: memory.id, text: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(null);
              }}
            />
            <SBtn disabled={edit.isPending} onClick={save}>
              Save
            </SBtn>
            <SBtn onClick={() => setEditing(null)}>Cancel</SBtn>
          </SRow>
        ) : (
          <SRow
            key={memory.id}
            title={memory.content}
            desc={`${SOURCE_LABEL[memory.source]}, ${day(memory.updatedAt)}`}
          >
            <SBtn
              onClick={() =>
                setEditing({ id: memory.id, text: memory.content })
              }
            >
              Edit
            </SBtn>
            <SBtn
              tone="danger"
              disabled={forget.isPending}
              onClick={() =>
                forget.mutate({ memoryId: memory.id }, { onError: fail })
              }
            >
              Delete
            </SBtn>
          </SRow>
        )
      )}
      {memories.length > 0 ? (
        <SRow
          title="Forget all"
          desc="Deletes every memory on this list. It cannot be undone."
        >
          <SBtn
            tone="danger"
            disabled={forget.isPending}
            onClick={() => forget.mutate({ all: true }, { onError: fail })}
          >
            Forget all
          </SBtn>
        </SRow>
      ) : null}
    </SGroup>
  );
}
