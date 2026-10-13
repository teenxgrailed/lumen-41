import {
  type KeyEvent,
  type KeyState,
  LEAD_MS,
  SHELL_SHORTCUTS,
  isTypingTarget,
  nextTheme,
  resolveKey,
  shortcutForSequence,
} from "../keys";

const ev = (key: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({
  key,
  code: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const idle: KeyState = { lead: "", leadAt: 0 };

/** Fire a key the way the shell does; returns what ran. */
function press(
  key: string,
  mods: Partial<KeyEvent> = {},
  typing = false,
  state = idle,
  now = 10_000
) {
  return resolveKey(ev(key, mods), typing, state, now);
}

describe("v3 shell keyboard table", () => {
  it("every row the sheet lists is handled, unless a screen owns it", () => {
    for (const row of SHELL_SHORTCUTS) {
      if (row.passive) continue;
      expect(row.href || row.action).toBeTruthy();
      expect(row.match || row.seq).toBeTruthy();
    }
  });

  it("every non-passive row fires from the keys it shows", () => {
    for (const row of SHELL_SHORTCUTS) {
      if (row.passive) continue;
      if (row.seq) {
        const lead = press(row.keys[0].toLowerCase());
        expect(lead.kind).toBe("lead");
        const r = press(
          row.keys[1].toLowerCase(),
          {},
          false,
          lead.state,
          10_100
        );
        expect(r.kind === "run" && r.shortcut).toBe(row);
        continue;
      }
      const keys = row.keys;
      const meta = keys.includes("⌘");
      const shift = keys.includes("⇧");
      const last = keys[keys.length - 1];
      const key =
        last === "esc" ? "Escape" : last === "?" ? "?" : last.toLowerCase();
      const r = press(key, {
        metaKey: meta,
        shiftKey: shift || key === "?",
        code: last === "\\" ? "Backslash" : "",
      });
      expect(r.kind === "run" && r.shortcut).toBe(row);
    }
  });

  it("has G T → Tasks and G P → Projects, and no G W", () => {
    expect(shortcutForSequence("gt")?.href).toBe("/tasks");
    expect(shortcutForSequence("gp")?.href).toBe("/projects");
    expect(shortcutForSequence("gw")).toBeUndefined();
    const labels = SHELL_SHORTCUTS.map((s) => s.label);
    expect(labels).not.toContain("Workspace");
  });

  it("⌘K and Ctrl+K open the palette; shifted K does not", () => {
    const k = (m: Partial<KeyEvent>) => {
      const r = press("k", m);
      return r.kind === "run" ? r.shortcut.action : null;
    };
    expect(k({ metaKey: true })).toBe("palette");
    expect(k({ ctrlKey: true })).toBe("palette");
    expect(k({ metaKey: true, shiftKey: true })).toBeNull();
  });

  it("⌘/ stays an alias of Ask Needt", () => {
    const r = press("/", { metaKey: true });
    expect(r.kind === "run" && r.shortcut.action).toBe("ask");
  });

  it("letters and sequences stand down inside a field; chords do not", () => {
    expect(press("n", {}, true).kind).toBe("none");
    expect(press("g", {}, true).kind).toBe("none");
    expect(press("?", { shiftKey: true }, true).kind).toBe("none");
    const chord = press("k", { metaKey: true }, true);
    expect(chord.kind === "run" && chord.shortcut.action).toBe("palette");
    const esc = press("Escape", {}, true);
    expect(esc.kind === "run" && esc.shortcut.action).toBe("close");
  });

  it("the G lead expires", () => {
    const lead = press("g");
    const late = press("t", {}, false, lead.state, 10_000 + LEAD_MS + 1);
    expect(late.kind).toBe("none");
    const n = press("n", {}, false, lead.state, 10_000 + LEAD_MS + 1);
    expect(n.kind === "run" && n.shortcut.action).toBe("composer");
  });

  it("cycles the theme System → Light → Dark → Time", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("time");
    expect(nextTheme("time")).toBe("system");
  });

  it("only real elements count as typing targets", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});
