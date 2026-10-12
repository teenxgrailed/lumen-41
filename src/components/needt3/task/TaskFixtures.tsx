"use client";

import { useState } from "react";

import { V3Root } from "@/components/needt3/root/V3Root";

import type { V3Task } from "@/lib/needt3/map";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Task, type TaskEntry, isTaskEvent } from "./Task";

/* The T06 fixture sheet: row / card / block × the eight states, on the
   prototype's day (Tuesday 1 September 2026). Toggles flip local state only;
   nothing here writes to the server. */
const TODAY = "2026-09-01";
const PROJECTS = [
  { id: "ops", name: "Operations", color: "var(--hue-orange)", icon: null },
  { id: "ds", name: "Design system", color: "var(--hue-blue)", icon: null },
];

const BASE: V3Task = {
  id: "plain",
  title: "Draft the launch brief",
  notes: null,
  done: false,
  status: "todo",
  projectId: "ops",
  dueDate: "2026-09-04",
  estimatedMinutes: 90,
  scheduledStart: "2026-09-01T09:00",
  scheduledEnd: "2026-09-01T10:30",
  isFixed: false,
  auto: true,
  noSlot: false,
  entry: null,
  chunk: null,
  splitAllowed: true,
  deadline: null,
  hardDeadline: false,
  priority: "medium",
  holder: null,
  blockedBy: null,
  value: null,
  earned: null,
  Stage: null,
  movedFrom: null,
  trashedAt: null,
  source: null,
  repeat: null,
  scheduleId: null,
  updatedAt: null,
  parts: [],
  waits: [],
};

const FIXTURES: { name: string; task: TaskEntry }[] = [
  { name: "plain", task: BASE },
  {
    name: "parts",
    task: {
      ...BASE,
      id: "parts",
      title: "Finish the tank graphic",
      projectId: "ds",
      scheduledStart: "2026-09-01T14:00",
      estimatedMinutes: 240,
      entry: "Open the artwork and pick the print side",
      parts: [
        { id: "p1", title: "Outline", done: true },
        { id: "p2", title: "Colour", done: false },
      ],
    },
  },
  {
    name: "waiting",
    task: {
      ...BASE,
      id: "waiting",
      title: "Ship the print files",
      scheduledStart: "2026-09-01T11:00",
      estimatedMinutes: 45,
      source: { kind: "mail", id: "m1", quote: "Can you send the files?" },
    },
  },
  {
    name: "overdue",
    task: {
      ...BASE,
      id: "overdue",
      title: "Send invoices for August",
      dueDate: "2026-08-31",
      scheduledStart: "2026-08-31T09:00",
      estimatedMinutes: 30,
      value: 1200,
    },
  },
  {
    name: "fixed",
    task: {
      ...BASE,
      id: "fixed",
      title: "Call the printer",
      isFixed: true,
      auto: false,
      scheduledStart: "2026-09-01T16:15",
      estimatedMinutes: 20,
    },
  },
  {
    name: "done",
    task: { ...BASE, id: "done", done: true, status: "completed" },
  },
  {
    name: "long title",
    task: {
      ...BASE,
      id: "long",
      title:
        "Reconcile the August card statements against the receipts folder and flag anything without a matching invoice before the accountant call",
      projectId: "ds",
    },
  },
  {
    name: "no project",
    task: {
      ...BASE,
      id: "inbox",
      title: "Renew the domain",
      projectId: null,
      scheduledStart: null,
      estimatedMinutes: 10,
    },
  },
];

function Sheet() {
  const setTheme = useNeedt3Ui((s) => s.setTheme);
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      FIXTURES.map((f) => [f.task.id, !isTaskEvent(f.task) && f.task.done])
    )
  );
  const live = (t: TaskEntry): TaskEntry =>
    isTaskEvent(t) ? t : { ...t, done: !!done[t.id] };
  const flip = (id: string) => setDone((d) => ({ ...d, [id]: !d[id] }));
  const common = { projects: PROJECTS, today: TODAY, onToggle: flip };
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: 32,
        background: "var(--surface-canvas)",
        color: "var(--text-primary)",
        font: "var(--type-ui)",
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          className="nx-btn nx-btn-sm"
          onClick={() => setTheme("light")}
        >
          Light
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-sm"
          onClick={() => setTheme("dark")}
        >
          Dark
        </button>
      </div>
      <h2
        style={{
          font: "var(--type-meta-medium)",
          color: "var(--text-tertiary)",
        }}
      >
        Row
      </h2>
      <div data-fixture="row" style={{ maxWidth: 760, padding: "8px 16px" }}>
        {FIXTURES.map((f) => (
          <Task key={f.name} task={live(f.task)} layout="row" {...common} />
        ))}
      </div>
      <h2
        style={{
          font: "var(--type-meta-medium)",
          color: "var(--text-tertiary)",
        }}
      >
        Card
      </h2>
      <div
        data-fixture="card"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 280px)",
          gap: 16,
          padding: "8px 0 24px",
        }}
      >
        {FIXTURES.map((f) => (
          <Task
            key={f.name}
            task={live(f.task)}
            layout="card"
            label={f.name === "overdue" ? "Overdue" : "Next up"}
            note={f.name}
            {...common}
          />
        ))}
      </div>
      <h2
        style={{
          font: "var(--type-meta-medium)",
          color: "var(--text-tertiary)",
        }}
      >
        Block
      </h2>
      <div
        data-fixture="block"
        style={{ display: "flex", gap: 12, padding: "8px 0 24px" }}
      >
        {FIXTURES.map((f) => (
          <div key={f.name} style={{ position: "relative", width: 140 }}>
            <Task
              task={live(f.task)}
              layout="block"
              box={{ w: 140, h: 72 }}
              style={{ position: "relative", height: 72 }}
              {...common}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskFixtures() {
  return (
    <V3Root>
      <Sheet />
    </V3Root>
  );
}
