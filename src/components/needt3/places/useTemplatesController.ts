"use client";

import { useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

import { newDate } from "@/lib/date-utils";
import {
  BUILTIN_TEMPLATES,
  type BuiltinTemplate,
} from "@/lib/needt3/builtin-templates";
import {
  useCreateFromBuiltin,
  useCreateFromTemplate,
  useTemplates,
} from "@/lib/needt3/hooks/places";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { templatePageTitle } from "./derive";

/** One card: a template the person saved, or one that comes with Needt. */
export interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  /** Set on a built-in template: its look and its blocks. */
  builtin: BuiltinTemplate | null;
}

/**
 * Templates: the list (the person's own, then the built-in set), the one write
 * (make a page from a template) and what follows it (the notice with Undo,
 * opening the page). The route calls this once above its two faces, so a press
 * in flight is one press whichever face is drawn when the window crosses
 * 700 px, and the follow-up (the notice and the navigation) is not left to a
 * card that may have unmounted.
 */
export function useTemplatesController() {
  const router = useRouter();
  const timeZone = useTimeZone();
  const templates = useTemplates();
  const fromSaved = useCreateFromTemplate();
  const fromBuiltin = useCreateFromBuiltin();
  const list = useMemo<TemplateItem[]>(
    () => [
      ...(templates.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        builtin: null,
      })),
      ...BUILTIN_TEMPLATES.map((b) => ({
        id: b.id,
        name: b.title,
        description: b.meta,
        builtin: b,
      })),
    ],
    [templates.data]
  );
  // A second press before the first has come back would make a duplicate page;
  // `isPending` only changes on the next render.
  const inflight = useRef(false);
  const make = { isPending: fromSaved.isPending || fromBuiltin.isPending };

  const makePage = async (id: string, name: string) => {
    if (inflight.current || make.isPending) return;
    inflight.current = true;
    try {
      const title = templatePageTitle(name, newDate(), timeZone);
      const page = id.startsWith("builtin:")
        ? await fromBuiltin.mutateAsync({ builtinId: id, title })
        : await fromSaved.mutateAsync({ templateId: id, title });
      if (!page.result) return;
      notify.success(`Created from “${name || "Untitled"}”`, {
        action: { label: "Undo", onClick: () => void page.undo() },
      });
      router.push(`/pages/${page.result.id}`);
    } catch {
      /* the hook told the person and put the cache back */
    } finally {
      inflight.current = false;
    }
  };

  return { templates, make, list, makePage };
}

export type TemplatesController = ReturnType<typeof useTemplatesController>;
