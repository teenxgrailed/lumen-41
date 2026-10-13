"use client";

import { useState } from "react";

import { NeedtPicker } from "@/components/ui/needt-picker";

/**
 * The consent form's workspace choice: the design system's picker, with the
 * value carried in a hidden input so the form stays a plain POST.
 */
export function WorkspacePicker({
  workspaces,
}: {
  workspaces: { id: string; label: string }[];
}) {
  const [value, setValue] = useState(workspaces[0]?.id ?? "");
  return (
    <>
      <NeedtPicker
        ariaLabel="Workspace"
        triggerVariant="field"
        value={value}
        onValueChange={setValue}
        options={workspaces.map((w) => ({ value: w.id, label: w.label }))}
      />
      <input type="hidden" name="workspaceId" value={value} />
    </>
  );
}
