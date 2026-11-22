"use client";

import {
  FOLDER_STYLES,
  FOLDER_STYLE_NAMES,
  type FolderStyleId,
} from "@/lib/needt3/folder-style";

import { Folder } from "../ui/Folder";
import {
  LAB_ITEMS,
  LAB_NOW,
  type LabItem,
  countOf,
  sheetsOf,
  statusOf,
  unitOf,
} from "./fixtures";

/**
 * Folders lab (admin only): the six looks of the production `Folder` side by
 * side on the same four fixture folders, in light and dark. The product draws
 * the same component (`ui/Folder`, `folderStyle` 1..6) from real project and
 * page data; here the data is a fixture with a fixed clock, so the shots are
 * the same on every run.
 */

const LINES: Record<FolderStyleId, string> = {
  1: "Count badge and a status pill that says what needs you (due today, synced).",
  2: "The project colour as glass, a glyph pressed into the front, task titles peeking.",
  3: "A slim pocket and a fan of papers; each paper carries a task title and its due day.",
  4: "A manila folder with the project glyph or app icon as a postage stamp, a clip on the papers.",
  5: "The connected apps stand in the folder, real marks only; badge counts them.",
  6: "Dark glass with when it last changed, and the people when they are known.",
};

function LabFolder({ item, style }: { item: LabItem; style: FolderStyleId }) {
  const Glyph = item.glyph;
  const status = statusOf(item);
  return (
    <Folder
      folderStyle={style}
      label={item.name}
      count={countOf(item)}
      unit={unitOf(item)}
      hue={item.hue}
      kind={item.kind}
      glyph={item.emoji ? <span>{item.emoji}</span> : <Glyph aria-hidden />}
      peeks={sheetsOf(item).map((s) => ({
        key: s.key,
        title: s.title,
        meta: s.due || undefined,
      }))}
      statusLabel={status === "Quiet" ? undefined : status}
      updatedAt={item.updatedAt}
      now={LAB_NOW}
      members={item.members}
      apps={item.apps}
      onClick={() => undefined}
      ariaLabel={`Open ${item.name}, ${countOf(item)} ${unitOf(item)}`}
      extra={{ "data-fl-item": item.id }}
    />
  );
}

function Stage({
  id,
  theme,
  style,
}: {
  id: string;
  theme: "light" | "dark";
  style: FolderStyleId;
}) {
  return (
    <div
      className="needt-v3 fl-stage"
      data-theme={theme === "dark" ? "dark" : undefined}
      data-lab-stage={`${id}-${theme}`}
    >
      <span className="fl-stage-tag">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
      <div className="fl-grid">
        {LAB_ITEMS.map((item) => (
          <LabFolder key={item.id} item={item} style={style} />
        ))}
      </div>
    </div>
  );
}

export function FolderLab({
  only,
  theme,
}: {
  only?: string;
  theme?: "light" | "dark";
}) {
  const list = FOLDER_STYLES.filter((n) => !only || `v${n}` === only);
  return (
    <div className="fl-lab" data-lab="">
      <header className="fl-lab-head">
        <h1 className="fl-lab-title">Folders lab</h1>
        <p className="fl-lab-sub">
          The six looks of the live folder, each with the same four fixture
          folders. In the product a folder wears the look its owner picked
          (Folder style, in the project&apos;s edit sheet and its right-click
          menu) or, on Auto, one chosen from its id. Fixture data, clock fixed
          at 22.11.26 12:00.
        </p>
      </header>
      {list.map((n) => (
        <section
          key={n}
          className="fl-variant"
          id={`v${n}`}
          data-lab-variant={`v${n}`}
        >
          <div className="fl-variant-head">
            <span className="fl-variant-label">{`V${n}`}</span>
            <span className="fl-variant-name">{FOLDER_STYLE_NAMES[n]}</span>
            <span className="fl-variant-line">{LINES[n]}</span>
          </div>
          <div className="fl-stages">
            {theme !== "dark" ? (
              <Stage id={`v${n}`} theme="light" style={n} />
            ) : null}
            {theme !== "light" ? (
              <Stage id={`v${n}`} theme="dark" style={n} />
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
