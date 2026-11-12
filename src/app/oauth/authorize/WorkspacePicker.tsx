"use client";

import { useState } from "react";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";
import { SSelect } from "@/components/needt3/settings/kit";

/**
 * The consent form's workspace choice: the design system's picker, with the
 * value carried in a hidden input so the form stays a plain POST. The portal
 * scope keeps the menu inside the page's `.needt-v3` theme.
 */
export function WorkspacePicker({
  workspaces,
}: {
  workspaces: { id: string; label: string }[];
}) {
  const [value, setValue] = useState(workspaces[0]?.id ?? "");
  return (
    <V3PortalScope>
      <SSelect
        label="Workspace"
        width="100%"
        align="start"
        value={value}
        onChange={setValue}
        options={workspaces.map((w) => [w.id, w.label] as const)}
      />
      <input type="hidden" name="workspaceId" value={value} />
    </V3PortalScope>
  );
}
