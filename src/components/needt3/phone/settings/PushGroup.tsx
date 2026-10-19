"use client";

import { usePushRow } from "@/lib/needt3/hooks/push-row";

import { PkButton } from "../kit";
import { PsGroup, PsRow } from "./parts";

/** Whether this phone can get notifications, and the button that sets it up. */
export function PhonePushGroup() {
  const row = usePushRow();
  return (
    <PsGroup title="This device">
      <PsRow
        title={row.title}
        desc={row.desc}
        control={
          row.actions.length > 0 ? (
            <>
              {row.actions.map((action) => (
                <PkButton
                  key={action.key}
                  kind="chip"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  data-ps-push={action.key}
                >
                  {action.label}
                </PkButton>
              ))}
            </>
          ) : undefined
        }
      />
    </PsGroup>
  );
}
