"use client";

import { useState } from "react";

import { FiEdit2, FiTrash2 } from "react-icons/fi";

import { sendJson } from "@/lib/needt3/hooks/core";

import { MemoriesGroup } from "../settings/MemoriesGroup";
import { AgBtn, shortWhen, useAgentHue } from "./AgParts";
import type { HubNoteRow } from "./TasksTab";

type Run = (task: () => Promise<unknown>, done?: string) => Promise<void>;

/** Every tag with its count, most used first. */
export function noteTags(notes: HubNoteRow[]) {
  const count = new Map<string, number>();
  for (const n of notes)
    for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return Array.from(count.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
}

/**
 * The Memory tab: two layers. "About you" is what Needt's assistant learned
 * about you (the same list as Settings, Memories). "Agent notes" is what
 * agents leave for each other, as cards in 3 / 2 / 1 masonry columns, each
 * with who wrote it, when it changed, Edit and Forget. The tag chips and
 * search live on the screen's sticky bar.
 */
export function MemoryTab({
  notes,
  tag,
  q,
  run,
}: {
  notes: HubNoteRow[];
  tag: string;
  q: string;
  run: Run;
}) {
  const hue = useAgentHue();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null
  );
  const needle = q.trim().toLowerCase();
  const shown = notes.filter(
    (n) =>
      (!tag || n.tags.includes(tag)) &&
      (!needle ||
        `${n.text} ${n.tags.join(" ")}`.toLowerCase().includes(needle))
  );
  return (
    <div className="ag-col" data-ag-memory="">
      <section className="ag-sec nx-swap">
        <div className="ag-glass ag-memory">
          <MemoriesGroup
            title="About you"
            hint="What Needt's assistant knows about you, so Ask and the planner fit you better. The same list as Settings, Memories."
          />
        </div>
      </section>

      <section className="ag-sec nx-swap" data-ag-notes="">
        <div className="ag-sec-head">
          <span className="ag-sec-titles">
            <h2 className="ag-h">Agent notes</h2>
            <p className="ag-hint">
              What agents leave for each other: decisions, facts about tools and
              accounts. Needt&apos;s assistant reads and writes them too. They
              are not about you.
            </p>
          </span>
        </div>
        {shown.length ? (
          <div className="ag-mgrid">
            {shown.map((note) => (
              <article
                key={note.id}
                className="ag-glass ag-mem"
                data-ag-note={note.id}
              >
                <span className="ag-mem-k">
                  <span
                    className="ag-dotc"
                    aria-hidden="true"
                    style={{ background: hue(note.author.name) }}
                  />
                  {`${note.tags[0] ?? "Note"} · ${note.author.name ?? "you"}`}
                </span>
                {editing && editing.id === note.id ? (
                  <textarea
                    className="nt-input ag-textarea"
                    aria-label="Note text"
                    value={editing.text}
                    onChange={(e) =>
                      setEditing({ id: note.id, text: e.target.value })
                    }
                  />
                ) : (
                  <p className="ag-mem-p">{note.text}</p>
                )}
                <span className="ag-mem-f">
                  {`Updated ${shortWhen(note.updatedAt)}${
                    note.ownerEdited ? " · edited by you" : ""
                  }`}
                  <span className="ag-mem-acts">
                    {editing && editing.id === note.id ? (
                      <>
                        <AgBtn tone="text" onClick={() => setEditing(null)}>
                          Cancel
                        </AgBtn>
                        <AgBtn
                          onClick={() =>
                            run(async () => {
                              await sendJson(
                                `/api/agent-hub/notes/${note.id}`,
                                "PATCH",
                                { text: editing?.text ?? note.text }
                              );
                              setEditing(null);
                            }, "Note saved")
                          }
                        >
                          Save
                        </AgBtn>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="cn-iconbtn"
                          aria-label="Edit note"
                          onClick={() =>
                            setEditing({ id: note.id, text: note.text })
                          }
                        >
                          <FiEdit2 size={13} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="cn-iconbtn"
                          aria-label="Forget note"
                          onClick={() =>
                            run(
                              () =>
                                sendJson(
                                  `/api/agent-hub/notes/${note.id}`,
                                  "DELETE"
                                ),
                              "Note forgotten"
                            )
                          }
                        >
                          <FiTrash2 size={13} aria-hidden />
                        </button>
                      </>
                    )}
                  </span>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="ag-glass ag-panel-empty" data-ag-empty="">
            {tag || needle
              ? "No notes match."
              : "No notes yet. Agents write what they learn here."}
          </div>
        )}
      </section>
    </div>
  );
}
