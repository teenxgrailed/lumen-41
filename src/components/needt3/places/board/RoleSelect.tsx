"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { LuCheck, LuChevronDown } from "react-icons/lu";

import type { BoardRole } from "@/lib/needt3/map";

import { useV3PortalContainer } from "../../ctx/PortalScope";
import { ROLE_LABEL } from "./logic";

const OPTIONS: BoardRole[] = ["VIEWER", "EDITOR"];

/**
 * A person's role on a board as a Radix menu (the native select is retired
 * by the UI contract). Full access is the owner's and is not offered.
 */
export function RoleSelect({
  value,
  label,
  onChange,
}: {
  value: BoardRole;
  label: string;
  onChange: (role: BoardRole) => void;
}) {
  const container = useV3PortalContainer();
  return (
    <Dropdown.Root modal={false}>
      <span className="docs-share-selwrap">
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${ROLE_LABEL[value]}`}
            className="docs-share-select"
          >
            {ROLE_LABEL[value]}
          </button>
        </Dropdown.Trigger>
        <span className="docs-share-chev" aria-hidden="true">
          <LuChevronDown size={12} />
        </span>
      </span>
      {container ? (
        <Dropdown.Portal container={container}>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="base-menu nx-pop is-right"
            style={{ zIndex: 1300, width: 200 }}
          >
            <Dropdown.RadioGroup
              value={value}
              onValueChange={(v) => onChange(v as BoardRole)}
            >
              {OPTIONS.map((k) => (
                <Dropdown.RadioItem
                  key={k}
                  value={k}
                  className="menu-row"
                  style={{ outline: "none" }}
                >
                  <span style={{ display: "flex", width: 14 }}>
                    {k === value ? <LuCheck size={14} aria-hidden /> : null}
                  </span>
                  {ROLE_LABEL[k]}
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}
