"use client";

import { useRef, useState } from "react";

import {
  useDeletePersonal,
  usePersonalBlocks,
} from "@/lib/needt3/hooks/personal";
import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import { PersonalEditForm } from "../../personal/PersonalEditForm";
import { PkButton, PkSheet } from "../kit";

/**
 * The sheet a personal band opens on the phone, from the calendar's day and
 * from Home's day alike: what it is, when, and Edit / Remove. Pass the tapped
 * band to open it and null to shut it; the last band stays drawn while the
 * sheet slides away.
 */
export function PersonalBandSheet({
  band,
  onClose,
}: {
  band: DayBand | null;
  onClose: () => void;
}) {
  const held = useRef<DayBand | null>(null);
  if (band) held.current = band;
  const shown = band ?? held.current;
  const [editing, setEditing] = useState(false);
  const remove = useDeletePersonal();
  const block = usePersonalBlocks().data?.blocks?.find(
    (b) => b.id === shown?.blockId
  );
  return (
    <PkSheet
      open={!!band}
      onClose={onClose}
      title={shown ? `${shown.emoji} ${shown.title}` : ""}
      meta={shown ? bandTimeLabel(shown) : null}
      className="pov-event"
      onShut={() => setEditing(false)}
      footer={
        editing ? undefined : (
          <>
            <PkButton kind="quiet" onClick={onClose}>
              Close
            </PkButton>
            <PkButton
              kind="quiet"
              data-pb-edit-open=""
              disabled={!block}
              onClick={() => setEditing(true)}
            >
              Edit
            </PkButton>
            <PkButton
              kind="primary"
              data-pb-remove=""
              onClick={() => {
                const b = shown;
                onClose();
                if (b) void remove({ id: b.blockId, title: b.title });
              }}
            >
              {shown?.repeating && !shown.linked ? "Remove all" : "Remove"}
            </PkButton>
          </>
        )
      }
    >
      {editing && block ? (
        <PersonalEditForm
          key={block.id}
          block={block}
          onDone={(saved) => {
            if (saved) onClose();
            else setEditing(false);
          }}
          actions={({ save, cancel, saving, problem }) => (
            <div className="pb-edit-foot">
              <PkButton kind="quiet" onClick={cancel}>
                Cancel
              </PkButton>
              <PkButton
                kind="primary"
                data-pb-save=""
                disabled={saving || !!problem}
                onClick={save}
              >
                Save
              </PkButton>
            </div>
          )}
        />
      ) : (
        <p className="pb-peek-meta">
          Kept for you. No task is placed here, and it stays in Needt.
        </p>
      )}
    </PkSheet>
  );
}
