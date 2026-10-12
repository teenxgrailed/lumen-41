"use client";

import { useRef } from "react";

import strings from "../../../../../docs/port/prototype/port/strings/en.json";
import { PkButton, PkField, PkSheet } from "../kit";
import { type NameAsk, UNTITLED_BOARD, nameOk } from "./model";

const t = strings["phone-habits.jsx"];

/** Name a board, new or renamed (PhbNameSheet). The text is the controller's. */
export function NameSheet({
  ask,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  ask: NameAsk | null;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  /* The last ask stays drawn while the sheet slides away. */
  const last = useRef<NameAsk | null>(null);
  if (ask) last.current = ask;
  const a = ask ?? last.current;
  const title =
    a?.mode === "rename" ? t.PhbBoards.rename_board : t.PhbBoards.new_board;
  const verb = a?.mode === "rename" ? t.PhbNameSheet.save : "Create";
  return (
    <PkSheet
      open={!!ask}
      onClose={onClose}
      title={title}
      label={title}
      className="phb-name-sheet"
      footer={
        <>
          <PkButton onClick={onClose}>{t.PhbNameSheet.cancel}</PkButton>
          <PkButton
            kind="primary"
            disabled={!a || !nameOk(a.value) || saving}
            onClick={onSubmit}
            data-phb-name-save
          >
            {verb}
          </PkButton>
        </>
      }
    >
      {a ? (
        <PkField
          label={t.PhbNameSheet.name}
          id="phb-board-name"
          value={a.value}
          onChange={onChange}
          placeholder={UNTITLED_BOARD}
          inputProps={{
            autoComplete: "off",
            enterKeyHint: "done",
            name: "board-name",
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            },
          }}
        />
      ) : null}
    </PkSheet>
  );
}
