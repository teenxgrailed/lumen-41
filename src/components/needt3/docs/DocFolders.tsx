"use client";

import { LuFileText, LuFolder } from "react-icons/lu";

import { Folder } from "../ui/Folder";
import { projectHue } from "../work/model";
import { docsCopy } from "./DocParts";
import { type DocGroup, UNSORTED, folderModel } from "./folders";

/**
 * The top level of Docs: one folder per project (and Unsorted). The same
 * grid as Projects (`.wk-pgrid.is-folders` on the desktop, `.ptk-plist` on
 * the phone). A click opens that group's list.
 */
export function DocFolders({
  groups,
  now,
  phone,
  onOpen,
}: {
  groups: readonly DocGroup[];
  now: number;
  phone?: boolean;
  onOpen: (key: string) => void;
}) {
  return (
    <div
      className={phone ? "ptk-plist is-folders" : "wk-pgrid is-folders"}
      data-docs-folders=""
    >
      {groups.map((g, i) => {
        const m = folderModel(g, now);
        return (
          <Folder
            key={m.key}
            className={"nx-swap" + (g.muted ? " is-muted" : "")}
            style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
            label={m.label}
            caption={m.caption}
            count={m.count}
            hue={
              m.hue ? projectHue({ id: m.key, color: m.hue }) : projectHue(null)
            }
            sticker={
              m.key === UNSORTED ? (
                <LuFileText size={40} aria-hidden />
              ) : (
                <LuFolder size={40} aria-hidden />
              )
            }
            peeks={m.peeks}
            onClick={() => onOpen(m.key)}
            ariaLabel={docsCopy.Folders.open(m.label, m.count)}
            extra={{ "data-docs-folder": m.key }}
          />
        );
      })}
    </div>
  );
}
