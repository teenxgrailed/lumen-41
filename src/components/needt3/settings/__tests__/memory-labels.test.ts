/**
 * The line under a memory ("Learned, Nov 23, 2026"): every source the server
 * can send has a label, and a source this build does not know, or none at all,
 * reads "Saved" instead of "undefined".
 */
import {
  SOURCE_LABEL,
  UNKNOWN_SOURCE_LABEL,
  memoryCaption,
  memoryDay,
  memorySourceLabel,
} from "../memory-labels";

const SERVER_SOURCES = [
  "chat",
  "inferred",
  "habit",
  "document",
  "mail",
  "assistant",
] as const;

describe("memorySourceLabel", () => {
  it("has a label for every source of the AgentMemorySource enum", () => {
    for (const source of SERVER_SOURCES) {
      expect(memorySourceLabel(source)).toBe(SOURCE_LABEL[source]);
      expect(memorySourceLabel(source)).not.toBe(UNKNOWN_SOURCE_LABEL);
    }
    expect(Object.keys(SOURCE_LABEL).sort()).toEqual(
      [...SERVER_SOURCES].sort()
    );
  });

  it("labels what an assistant saved through MCP or the API", () => {
    expect(memorySourceLabel("assistant")).toBe("Saved by an assistant");
  });

  it("falls back for an unknown, empty or missing source", () => {
    for (const source of ["import", "", undefined, null, "toString"]) {
      expect(memorySourceLabel(source)).toBe(UNKNOWN_SOURCE_LABEL);
    }
  });
});

describe("memoryCaption", () => {
  it("joins the label and the day", () => {
    const iso = "2026-11-23T12:00:00.000Z";
    expect(memoryCaption("chat", iso)).toBe(`You told Ask, ${memoryDay(iso)}`);
    expect(memoryDay(iso)).toMatch(/2026/);
  });

  it("never says undefined", () => {
    const iso = "2026-11-23T12:00:00.000Z";
    for (const source of [undefined, null, "", "brand-new-source"]) {
      const caption = memoryCaption(source, iso);
      expect(caption).not.toMatch(/undefined|null|Invalid/i);
      expect(caption.startsWith(`${UNKNOWN_SOURCE_LABEL}, `)).toBe(true);
    }
  });

  it("drops the day when the date is missing or invalid", () => {
    expect(memoryCaption("habit", undefined)).toBe("Your work habits");
    expect(memoryCaption("habit", "not a date")).toBe("Your work habits");
    expect(memoryCaption(undefined, "not a date")).toBe(UNKNOWN_SOURCE_LABEL);
  });
});
