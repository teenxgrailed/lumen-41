"use client";

import { KEY_GROUPS, SHELL_SHORTCUTS } from "../shell/keys";
import { Kbd, SGroup, SRow } from "./kit";

/** The same table the key handler and the keyboard sheet read (shell/keys.ts). */
export function KeysSection() {
  return (
    <>
      {KEY_GROUPS.map((group) => (
        <SGroup key={group} title={group}>
          {SHELL_SHORTCUTS.filter((s) => s.group === group).map((s) => (
            <SRow key={s.label} title={s.label}>
              <span className="settings-row-9">
                {s.keys.map((k, i) => (
                  <Kbd key={i} k={k} />
                ))}
              </span>
            </SRow>
          ))}
        </SGroup>
      ))}
    </>
  );
}
