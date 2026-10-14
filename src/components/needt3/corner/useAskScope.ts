"use client";

/* WHAT ASK NEEDT IS LOOKING AT, from the live app (prototype Chat.jsx
 * `lastTask` / `scopePick`): the task row last pressed on this screen, the
 * open doc, the place. The rules themselves are pure, in ./scope.
 */
import * as React from "react";

import { usePathname } from "next/navigation";

import { useDoc, useDocs } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useTasks } from "@/lib/needt3/hooks/tasks";

import { useOpenDocId } from "../document/open-doc";
import { type AskScope, type Mention, sameScope, scopesFor } from "./scope";

export function useAskScope() {
  const pathname = usePathname();
  const place = pathname?.split("/")[1] ?? "";
  const docId = useOpenDocId();
  const doc = useDoc(docId);
  const tasks = useTasks();
  const [last, setLast] = React.useState<{ id: string; place: string } | null>(
    null
  );
  const [pick, setPick] = React.useState<AskScope | null>(null);
  const placeRef = React.useRef(place);
  placeRef.current = place;

  // A press on a task row outside the panel is "the task I am looking at".
  React.useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const row = el?.closest("[data-task]");
      const id = row?.getAttribute("data-task");
      if (row && id && !row.closest("[data-chat-panel]")) {
        setLast({ id, place: placeRef.current });
      }
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  // A pick holds until the screen changes.
  React.useEffect(() => setPick(null), [place, docId]);

  const task =
    last && last.place === place
      ? (tasks.data ?? []).find((t) => t.id === last.id && !t.done)
      : undefined;
  const docTitle = docId ? (doc.data ? doc.data.title : "") : null;

  const list = React.useMemo(
    () =>
      scopesFor({
        place,
        task: task ? { id: task.id, title: task.title } : null,
        docTitle,
        dayName: "Today",
      }),
    [place, task, docTitle]
  );
  const scope = (pick && list.some((s) => sameScope(s, pick)) ? pick : null) ??
    list[0] ?? { kind: "workspace" as const };
  return { scope, list, setPick };
}

/** Things @ can point at, narrowed by what has been typed after it. */
export function useMentionItems(query: string | null): Mention[] {
  const tasks = useTasks();
  const docs = useDocs();
  const projects = useProjects();
  return React.useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const fits = (label: string) => !q || label.toLowerCase().includes(q);
    const out: Mention[] = [];
    for (const t of tasks.data ?? []) {
      if (!t.done && fits(t.title)) {
        out.push({ kind: "task", id: t.id, label: t.title });
      }
    }
    const tasksFirst = out.slice(0, 5);
    const docsList: Mention[] = (docs.data ?? [])
      .filter((d) => !d.trashedAt && fits(d.title || "Untitled"))
      .slice(0, 4)
      .map((d) => ({ kind: "doc", id: d.id, label: d.title || "Untitled" }));
    const projectList: Mention[] = (projects.data ?? [])
      .filter((p) => !p.archived && fits(p.name))
      .slice(0, 3)
      .map((p) => ({ kind: "project", id: p.id, label: p.name }));
    return [...tasksFirst, ...docsList, ...projectList];
  }, [query, tasks.data, docs.data, projects.data]);
}
