"use client";

import { SBtn, SGroup, SRow, V3Switch } from "./kit";
import {
  SOURCE_LABEL,
  memoryDay,
  useMemoriesControl,
} from "./use-memories-control";

/**
 * Settings, Memories. The switch is off until the person turns it on; off
 * means nothing is learned and nothing learned is used. Turning it off with
 * memories on the list asks whether to keep or delete them. The list is
 * readable either way, and every line can be edited or deleted.
 */
export function MemoriesGroup() {
  const m = useMemoriesControl();
  const { editing } = m;

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
          checked={m.enabled}
          disabled={!m.loaded || m.switching}
          onChange={m.turn}
        />
      </SRow>
      {m.asking ? (
        <SRow
          title="Keep what Needt learned?"
          desc={`${m.memories.length} ${m.memories.length === 1 ? "memory" : "memories"}. Kept, they stay on this list but nothing uses them.`}
        >
          <SBtn onClick={() => m.turnOff(true)}>Keep them</SBtn>
          <SBtn tone="danger" onClick={() => m.turnOff(false)}>
            Delete them
          </SBtn>
          <SBtn onClick={m.cancelAsking}>Cancel</SBtn>
        </SRow>
      ) : null}
      {m.loaded && m.memories.length === 0 ? (
        <SRow
          title="Nothing learned yet"
          desc={
            m.enabled
              ? "Habits appear after you finish some tasks. Tell Ask a preference and it shows up here."
              : "Turn the switch on and what Needt learns will be listed here."
          }
        />
      ) : null}
      {m.memories.map((memory) =>
        editing?.id === memory.id ? (
          <SRow key={memory.id} title="Edit memory">
            <input
              className="pl-field"
              aria-label="Memory"
              maxLength={500}
              value={editing.text}
              autoFocus
              onChange={(e) =>
                m.setEditing({ id: memory.id, text: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") m.save();
                if (e.key === "Escape") m.setEditing(null);
              }}
            />
            <SBtn disabled={m.saving} onClick={m.save}>
              Save
            </SBtn>
            <SBtn onClick={() => m.setEditing(null)}>Cancel</SBtn>
          </SRow>
        ) : (
          <SRow
            key={memory.id}
            title={memory.content}
            desc={`${SOURCE_LABEL[memory.source]}, ${memoryDay(memory.updatedAt)}`}
          >
            <SBtn
              onClick={() =>
                m.setEditing({ id: memory.id, text: memory.content })
              }
            >
              Edit
            </SBtn>
            <SBtn
              tone="danger"
              disabled={m.forgetting}
              onClick={() => m.remove(memory.id)}
            >
              Delete
            </SBtn>
          </SRow>
        )
      )}
      {m.memories.length > 0 ? (
        <SRow
          title="Forget all"
          desc="Deletes every memory on this list. It cannot be undone."
        >
          <SBtn tone="danger" disabled={m.forgetting} onClick={m.forgetAll}>
            Forget all
          </SBtn>
        </SRow>
      ) : null}
    </SGroup>
  );
}
