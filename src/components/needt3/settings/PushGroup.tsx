"use client";

import { usePushRow } from "@/lib/needt3/hooks/push-row";

import { SBtn, SGroup, SRow } from "./kit";

/** Whether this device can get notifications, and the button that sets it up. */
export function PushGroup() {
  const row = usePushRow();
  return (
    <SGroup title="This device">
      <SRow title={row.title} desc={row.desc}>
        {row.actions.map((action) => (
          <SBtn
            key={action.key}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </SBtn>
        ))}
      </SRow>
    </SGroup>
  );
}
