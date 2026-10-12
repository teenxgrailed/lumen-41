import type { Notice } from "@/components/needt/corner/types";

import {
  CORNER_PILL,
  cornerClip,
  cornerFrame,
  cornerIsland,
  cornerPanel,
} from "@/lib/assistant-position";

import { ISLAND_ROWS, hiddenLabel, islandHasRows, islandView } from "../island";
import { changedData, readLines, touchedTaskId } from "../stream";

const n = (id: string, extra: Partial<Notice> = {}): Notice => ({
  id,
  kind: "done",
  title: id,
  body: "",
  ...extra,
});

describe("notifications island", () => {
  it("draws at most four rows, newest last", () => {
    expect(ISLAND_ROWS).toBe(4);
    const list = ["a", "b", "c", "d", "e"].map((id) => n(id));
    const view = islandView(list);
    expect(view.rows.map((r) => r.id)).toEqual(["b", "c", "d", "e"]);
    expect(view.hidden).toBe(1);
  });

  it("shows a count only when rows are hidden", () => {
    const three = islandView([n("a"), n("b"), n("c")]);
    expect(three.hidden).toBe(0);
    expect(hiddenLabel(three.hidden)).toBeNull();
    expect(hiddenLabel(2)).toBe("2 more");
  });

  it("does not count a hidden notice that is already leaving", () => {
    const list = [n("a", { leaving: true }), n("b"), n("c"), n("d"), n("e")];
    expect(islandView(list).hidden).toBe(0);
  });

  it("retracts to the pill once everything is leaving", () => {
    expect(islandHasRows([])).toBe(false);
    expect(islandHasRows([n("a", { leaving: true })])).toBe(false);
    expect(islandHasRows([n("a")])).toBe(true);
  });
});

describe("corner geometry", () => {
  it("is one element: every shape is a clip of the same frame", () => {
    const panel = cornerPanel(900);
    const island = cornerIsland(1, false);
    const frame = cornerFrame(CORNER_PILL, island, panel);
    expect(panel).toEqual({ w: 400, h: 600, r: 20 });
    expect(island).toEqual({ w: 376, h: 54, r: 18 });
    expect(frame).toEqual({ w: 400, h: 600 });
    expect(cornerClip(CORNER_PILL, frame)).toBe(
      "inset(560px 0px 0px 258px round 12px)"
    );
    expect(cornerClip(island, frame)).toBe(
      "inset(546px 0px 0px 24px round 18px)"
    );
    expect(cornerClip(panel, frame)).toBe("inset(0px 0px 0px 0px round 20px)");
  });

  it("grows the island by a row, plus the count line when one is hidden", () => {
    expect(cornerIsland(4, true).h).toBe(4 * 54 + 28);
    expect(cornerPanel(500).h).toBe(460);
  });
});

describe("/api/ai/chat stream", () => {
  it("keeps a line split across chunks for the next read", () => {
    const first = readLines(
      '{"type":"meta","conversationId":"c1"}\n{"type":"tok'
    );
    expect(first.events).toEqual([{ type: "meta", conversationId: "c1" }]);
    const second = readLines(`${first.rest}en","value":"Hi"}\n`);
    expect(second.events).toEqual([{ type: "token", value: "Hi" }]);
    expect(second.rest).toBe("");
  });

  it("names the task a tool touched", () => {
    const meta = {
      type: "meta" as const,
      toolName: "edit_task",
      toolPayload: { taskId: "t1" },
    };
    expect(touchedTaskId(meta)).toBe("t1");
    expect(changedData(meta)).toBe(true);
    expect(
      changedData({ type: "meta", toolName: "confirmation_required" })
    ).toBe(false);
  });
});
