/**
 * Smoke render (server markup) of the kit's static pieces: the DOM the vendored
 * styles/phone-kit.css selects on. Gestures and springs need a browser and are
 * covered by lib/needt3/__tests__/gesture.test.ts.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import type { V3Task } from "@/lib/needt3/map";

import {
  PkActions,
  PkButton,
  PkEmpty,
  PkNumber,
  PkRow,
  PkScreen,
  PkSection,
  PkSheet,
  PkTaskRow,
  PkTheme,
} from "..";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(h(PkTheme.Provider, { value: "light" }, el));

const task = {
  id: "t1",
  title: "Call Anna",
  done: false,
  dueDate: "2026-08-30",
  scheduledStart: "2026-09-01T14:30",
  estimatedMinutes: 90,
} as unknown as V3Task;

describe("kit markup", () => {
  it("PkNumber draws one strip per digit and keeps the words for a screen reader", () => {
    const out = html(h(PkNumber, { value: "12 h" }));
    expect(out).toContain('aria-label="12 h"');
    expect(out.match(/pk-num-strip/g)).toHaveLength(2);
    expect(out).toContain("pk-num-ch");
  });

  it("PkRow: ring, one open button, no button in a button", () => {
    const out = html(
      h(PkRow, {
        id: "r",
        title: "Title",
        meta: "meta",
        time: "09:00",
        onOpen: () => {},
        onSwipe: () => {},
        canDone: true,
        canLater: true,
      })
    );
    expect(out).toContain('data-pk-row="r"');
    expect(out).toContain("pk-check");
    expect(out.match(/<button/g)).toHaveLength(2);
    expect(out).toContain("pk-reveal is-done dark");
    expect(out).toContain("pk-reveal is-later");
    expect(out).toContain("Tomorrow");
  });

  it("PkRow without swipe has no reveal; a done row is marked", () => {
    const out = html(h(PkRow, { id: "r", title: "T", done: true }));
    expect(out).not.toContain("pk-reveal");
    expect(out).toContain("is-done");
    expect(out).toContain('aria-pressed="true"');
  });

  it("PkTaskRow reads a V3Task: since, duration, clock", () => {
    const out = html(
      h(PkTaskRow, {
        t: task,
        late: true,
        project: { name: "Resale", color: "var(--accent)" },
      })
    );
    expect(out).toContain("Call Anna");
    expect(out).toContain("Since 30 Aug");
    expect(out).toContain("1 h 30");
    expect(out).toContain("14:30");
    expect(out).toContain("Resale");
    expect(out).toContain("is-late");
    expect(
      html(
        h(PkTaskRow, {
          t: task,
          hideProject: true,
          project: { name: "Resale", color: null },
        })
      )
    ).not.toContain("Resale");
  });

  it("PkSection folds", () => {
    const open = html(
      h(PkSection, { title: "Today", count: 3, onFold: () => {} }, "rows")
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("rows");
    const shut = html(
      h(PkSection, { title: "Today", folded: true, onFold: () => {} }, "rows")
    );
    expect(shut).not.toContain("rows");
    expect(shut).toContain("is-folded");
  });

  it("PkEmpty: sky badge by default, none with sky={false}", () => {
    expect(html(h(PkEmpty, { line: "Nothing" }))).toContain("pk-skybadge");
    expect(html(h(PkEmpty, { line: "Nothing", sky: false }))).not.toContain(
      "pk-skybadge"
    );
    expect(html(h(PkEmpty, { title: "T", line: "L", action: "A" }))).toContain(
      "pk-empty-action"
    );
  });

  it("PkButton keeps its kind and ellipsises its text", () => {
    const out = html(h(PkButton, { kind: "primary", block: true }, "Go"));
    expect(out).toContain("pk-btn is-primary is-block");
    expect(out).toContain("pk-btn-cut");
  });

  it("PkScreen: title, compact title, top band, fog, tail", () => {
    const out = html(
      h(PkScreen, { title: "Tasks", sub: "3 open", screen: "tasks" }, "body")
    );
    expect(out).toContain('data-pk-screen="tasks"');
    expect(out).toContain('<h1 class="pk-title">Tasks</h1>');
    expect(out).toContain("pk-compact-title");
    expect(out).toContain("pk-topband");
    expect(out).toContain("pk-fog");
    expect(out).toContain("pk-tail");
    expect(out).toContain('data-pk-band-on="0"');
    expect(html(h(PkScreen, { title: "T", tail: false }))).not.toContain(
      "pk-tail"
    );
  });

  it("PkSheet: a shut sheet is hidden from assistive tech; open is a modal dialog with its footer", () => {
    const shut = html(h(PkSheet, { open: false, title: "New task" }, "x"));
    expect(shut).toContain('data-pk-sheet="shut"');
    expect(shut).toContain("inert");
    const open = html(
      h(
        PkSheet,
        { open: true, title: "New task", footer: "foot", detents: [0.5, 0.92] },
        "body"
      )
    );
    expect(open).toContain('data-pk-sheet="open"');
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain("pk-sheet-foot");
    expect(open).toContain("pk-scrim");
  });

  it("PkActions lists its actions in a menu, skipping false entries", () => {
    const out = html(
      h(PkActions, {
        acts: {
          title: "Call Anna",
          actions: [
            { label: "Move to tomorrow" },
            false,
            { label: "Delete", danger: true },
          ],
        },
        onClose: () => {},
      })
    );
    expect(out).toContain('role="menu"');
    expect(out).toContain("Move to tomorrow");
    expect(out).toContain("pk-act is-danger");
    expect(out.match(/role="menuitem"/g)).toHaveLength(2);
  });
});
