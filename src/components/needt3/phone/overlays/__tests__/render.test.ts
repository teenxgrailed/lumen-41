/**
 * Smoke render (server markup) of the overlays: the DOM the vendored
 * styles/phone-overlays.css selects on, and the words the owner decisions
 * keep. Gestures and the morph need a browser; their rules are in
 * lib/needt3/__tests__/gesture.test.ts and pillRect.test.ts.
 */
import { createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import type { V3Task } from "@/lib/needt3/map";

import type { AskMessage } from "../../../corner/useAskNeedt";
import { PkTheme } from "../../kit";
import { PkAsk } from "../Ask";
import { PkComposer } from "../Composer";
import { PkEventSheet, PkNewEventSheet } from "../EventSheet";
import { PkPaywall } from "../Paywall";
import { PkTaskSheet } from "../TaskSheet";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(PkTheme.Provider, { value: "light" }, el)
    )
  );

const none = () => undefined;

const task = {
  id: "t1",
  title: "Call Anna",
  notes: "Ask about the invoice",
  done: false,
  status: "todo",
  projectId: null,
  dueDate: "2026-09-01",
  estimatedMinutes: 45,
  scheduledStart: "2026-09-01T14:30",
  scheduledEnd: "2026-09-01T15:15",
  isFixed: false,
  auto: true,
  noSlot: false,
  entry: "Find the number",
  chunk: null,
  splitAllowed: true,
  deadline: null,
  hardDeadline: false,
  priority: "high",
  source: null,
  trashedAt: null,
  parts: [
    { id: "p1", title: "Find the number", done: true },
    { id: "p2", title: "Ring", done: false },
  ],
  waits: [{ id: "w1", on: "u2", onName: "Anna", for: "the invoice" }],
} as unknown as V3Task;

describe("PkTaskSheet", () => {
  const out = html(
    h(PkTaskSheet, { task, open: true, onClose: none, onFocus: none })
  );

  it("is a modal dialog with the title, the done ring and the saved flash", () => {
    expect(out).toContain('role="dialog"');
    expect(out).toContain("pov-task");
    expect(out).toContain("Call Anna");
    expect(out).toContain("pov-ring");
    expect(out).toContain('data-pov-saved="0"');
  });

  it("keeps the owner-decided First step and Scheduling sections", () => {
    expect(out).toContain("data-pov-step");
    expect(out).toContain("First step");
    expect(out).toContain("Find the number");
    expect(out).toContain('data-pov-sched="folded"');
    expect(out).toContain("Scheduling");
    // folded: one summary line
    expect(out).toContain("Auto 14:30");
  });

  it("draws the facts, the parts count and the wait", () => {
    for (const f of ["date", "time", "duration", "project", "priority"])
      expect(out).toContain(`data-pov-fact="${f}"`);
    expect(out).not.toContain('data-pov-fact="labels"');
    expect(out).toContain("1 of 2");
    expect(out).toContain("Waiting on");
    expect(out).toContain("Anna for the invoice");
    expect(out).toContain("Delete task");
    expect(out).toContain("Start focus");
  });

  it("nothing is mounted until it has been opened", () => {
    expect(
      html(h(PkTaskSheet, { task: null, open: false, onClose: none }))
    ).toBe("");
  });

  it("a done task offers Reopen, not Done", () => {
    const done = html(
      h(PkTaskSheet, {
        task: { ...task, done: true } as V3Task,
        open: true,
        onClose: none,
      })
    );
    expect(done).toContain("Reopen");
    expect(done).not.toContain("Start focus");
  });
});

describe("PkComposer", () => {
  const out = html(h(PkComposer, { open: true, onClose: none }));
  it("one big field, the three chips, Add disabled while empty", () => {
    expect(out).toContain("data-pov-line");
    for (const c of ["date", "project", "priority"])
      expect(out).toContain(`data-pov-chip="${c}"`);
    expect(out).not.toContain("data-pov-attach-btn");
    expect(out).toMatch(
      /<button[^>]*disabled[^>]*data-pov-add|data-pov-add[^>]*disabled/
    );
    expect(out).toContain("Say when, which project, how urgent");
  });
  it("is a sheet that can grow out of the pill", () => {
    expect(out).toContain("pk-sheet-morph");
    expect(out).toContain("pov-composer");
  });
});

describe("PkAsk", () => {
  const base = {
    open: true,
    onClose: none,
    messages: [],
    phase: "idle" as const,
    scope: { kind: "workspace" as const },
    onSend: none,
    onStop: none,
    onNew: none,
  };
  const msg = (over: Partial<AskMessage>): AskMessage => ({
    id: "m",
    from: "needt",
    text: "",
    at: 0,
    ...over,
  });

  it("opens on the six suggestions, live, and says nothing about not being connected", () => {
    const out = html(h(PkAsk, base));
    expect(out).not.toContain("isn’t connected");
    expect(out.match(/data-pov-sugg=/g)).toHaveLength(6);
    expect(out).toContain("Plan my day");
    expect(out).toContain("Find free time this week");
    expect(out).not.toMatch(/class="pov-sugg"[^>]*disabled/);
    expect(out).not.toContain("Noted — I");
    expect(out).not.toMatch(/pov-ask-input[^>]*disabled/);
  });

  it("the suggestions follow what it is looking at", () => {
    const out = html(
      h(PkAsk, { ...base, scope: { kind: "doc" as const, title: "Brief" } })
    );
    expect(out).toContain("Summarise this doc");
    expect(out).toContain("I&#x27;m looking at");
    expect(out.match(/data-pov-sugg=/g)).toHaveLength(6);
  });

  it("attach is drawn and off", () => {
    const out = html(h(PkAsk, base));
    expect(out).toMatch(
      /data-pov-ask-attach[^>]*>|<button[^>]*disabled[^>]*pov-ask-attach/
    );
    expect(out).toMatch(/<button[^>]*pov-ask-attach[^>]*disabled/);
  });

  it("shows the thread and hides the suggestions once there is one", () => {
    const out = html(
      h(PkAsk, {
        ...base,
        messages: [
          msg({ id: "a", from: "you", text: "What is overdue?" }),
          msg({ id: "b", text: "Two tasks." }),
        ],
      })
    );
    expect(out).toContain("What is overdue?");
    expect(out).toContain("Two tasks.");
    expect(out).not.toContain("data-pov-sugg");
    expect(out).toContain("data-pov-ask-new");
  });

  it("thinks, then streams with a caret, and swaps Send for Stop", () => {
    const thinking = html(
      h(PkAsk, {
        ...base,
        phase: "thinking" as const,
        messages: [msg({ id: "a", from: "you", text: "Hi" }), msg({ id: "b" })],
      })
    );
    expect(thinking).toContain("Thinking…");
    expect(thinking).toContain("data-pov-ask-stop");
    const streaming = html(
      h(PkAsk, {
        ...base,
        phase: "streaming" as const,
        messages: [
          msg({ id: "a", from: "you", text: "Hi" }),
          msg({ id: "b", text: "Placing" }),
        ],
      })
    );
    expect(streaming).toContain("Placing");
    expect(streaming).toContain("chat-caret");
    expect(streaming).not.toContain("Thinking…");
  });

  it("a Free plan gets the reason and a way to the plans; Pro gets the reason only", () => {
    const reason = "The AI agent is available on Needt Pro and Lifetime.";
    const free = html(
      h(PkAsk, {
        ...base,
        onUpgrade: none,
        messages: [
          msg({ id: "a", from: "you", text: "Plan my day" }),
          msg({ id: "b", text: reason, failed: true, upgrade: true }),
        ],
      })
    );
    expect(free).toContain(reason);
    expect(free).toContain("is-failed");
    expect(free).toContain("data-pov-ask-plans");
    const resting = html(
      h(PkAsk, {
        ...base,
        onUpgrade: none,
        messages: [
          msg({ id: "a", from: "you", text: "Plan my day" }),
          msg({ id: "b", text: "Needt AI is resting.", failed: true }),
        ],
      })
    );
    expect(resting).toContain("Needt AI is resting.");
    expect(resting).not.toContain("data-pov-ask-plans");
  });

  it("an action the agent asked about waits for Confirm", () => {
    const out = html(
      h(PkAsk, {
        ...base,
        messages: [
          msg({ id: "a", from: "you", text: "Archive it" }),
          msg({ id: "b", text: "Archive this task?", confirm: "Archive it" }),
        ],
      })
    );
    expect(out).toContain("data-pov-ask-confirm");
  });
});

describe("PkPaywall", () => {
  const out = html(
    h(PkPaywall, { open: true, onClose: none, feature: "Plan my day" })
  );
  it("prices come from NEEDT_PRICING and no seat count is spelled", () => {
    expect(out).toContain("$4.92");
    expect(out).toContain("$149");
    expect(out).toContain("−30%");
    expect(out).toContain("Choose Pro · $59 / year");
    expect(out).not.toContain("Start 14-day free trial");
    expect(out).toContain("Prices in USD. Taxes may apply.");
    expect(out).toContain("First 300 buyers");
    expect(out).not.toContain("212");
  });
  it("names the feature that asked, and lists what Pro includes", () => {
    expect(out).toContain("Unlock <b>Plan my day</b> with Pro");
    expect(out).toContain("Every Pro plan includes");
    expect(out).toContain("AI included");
  });
  it("is a sheet, a close button and a bar with the call to action", () => {
    expect(out).toContain("pov-paywall");
    expect(out).toContain("data-pw-close");
    expect(out).toContain('data-pw-cta="annual"');
  });
  it("the button is off while the plan has not loaded", () => {
    expect(out).toMatch(/data-pw-cta="annual" disabled=""/);
  });
});

describe("PkEventSheet", () => {
  it("title, day line, facts; Done by default", () => {
    const out = html(
      h(PkEventSheet, {
        open: true,
        onClose: none,
        title: "Standup",
        meta: "Tue 1 Sep",
        facts: [
          ["Time", "10:00 – 10:30"],
          ["Overlaps", "Dentist"],
        ],
      })
    );
    expect(out).toContain("Standup");
    expect(out).toContain("<dt>Overlaps</dt><dd>Dentist</dd>");
    expect(out).toContain("Done");
  });
  it("no footer when null", () => {
    expect(
      html(
        h(PkEventSheet, { open: true, onClose: none, title: "x", footer: null })
      )
    ).not.toContain("pk-sheet-foot");
  });
  it("a new event offers lengths and Add", () => {
    const out = html(
      h(PkNewEventSheet, {
        open: true,
        onClose: none,
        draft: { startAt: "2026-09-01T10:00", endAt: "2026-09-01T10:30" },
      })
    );
    expect(out).toContain("data-pov-lengths");
    expect(out).toContain("data-pov-add-event");
    expect(out).toContain("2026-09-01 · 10:00");
  });
});
