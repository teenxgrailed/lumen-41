"use client";

import {
  SOURCE_LABEL,
  memoryDay,
  useMemoriesControl,
} from "../../settings/use-memories-control";
import { PkButton } from "../kit";
import { PsGroup, PsRow, PsSwitch } from "./parts";

/**
 * Settings, Data, Memories on the phone: the desktop group's twin (same
 * behaviour from `useMemoriesControl`). Off until turned on; the list reads
 * either way; a line can be edited or deleted; Forget all empties it; turning
 * the switch off with memories listed asks keep or delete.
 */
export function PhoneMemoriesGroup() {
  const m = useMemoriesControl();
  const { editing } = m;

  return (
    <PsGroup
      title="Memories"
      hint="What Needt knows about you, so Ask and the planner fit you better."
    >
      <PsRow
        title="Let Needt learn about me"
        desc="Learns your work habits, the preferences you tell Ask, and short facts from your documents and mail subjects. Never mail bodies. Off, nothing is learned or used."
        control={
          <PsSwitch
            label="Let Needt learn about me"
            on={m.enabled}
            disabled={!m.loaded || m.switching}
            onChange={m.turn}
          />
        }
      />
      {m.asking ? (
        <PsRow
          title="Keep what Needt learned?"
          desc={`${m.memories.length} ${m.memories.length === 1 ? "memory" : "memories"}. Kept, they stay listed but nothing uses them.`}
          control={
            <>
              <PkButton kind="chip" onClick={() => m.turnOff(true)}>
                Keep them
              </PkButton>
              <PkButton kind="chip" onClick={() => m.turnOff(false)}>
                Delete them
              </PkButton>
              <PkButton kind="chip" onClick={m.cancelAsking}>
                Cancel
              </PkButton>
            </>
          }
        />
      ) : null}
      {m.loaded && m.memories.length === 0 ? (
        <PsRow
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
          <PsRow
            key={memory.id}
            title="Edit memory"
            desc={
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
            }
            control={
              <>
                <PkButton kind="chip" disabled={m.saving} onClick={m.save}>
                  Save
                </PkButton>
                <PkButton kind="chip" onClick={() => m.setEditing(null)}>
                  Cancel
                </PkButton>
              </>
            }
          />
        ) : (
          <PsRow
            key={memory.id}
            title={memory.content}
            desc={`${SOURCE_LABEL[memory.source]}, ${memoryDay(memory.updatedAt)}`}
            control={
              <>
                <PkButton
                  kind="chip"
                  onClick={() =>
                    m.setEditing({ id: memory.id, text: memory.content })
                  }
                >
                  Edit
                </PkButton>
                <PkButton
                  kind="chip"
                  disabled={m.forgetting}
                  onClick={() => m.remove(memory.id)}
                >
                  Delete
                </PkButton>
              </>
            }
          />
        )
      )}
      {m.memories.length > 0 ? (
        <PsRow
          tone="danger"
          title="Forget all"
          desc="Deletes every memory on this list."
          disabled={m.forgetting}
          onOpen={m.forgetAll}
          chevron={false}
        />
      ) : null}
    </PsGroup>
  );
}
