"use client";

import { useRef } from "react";

import { useRouter } from "next/navigation";

import { newDate } from "@/lib/date-utils";
import { useCreateFromTemplate, useTemplates } from "@/lib/needt3/hooks/places";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { templatePageTitle } from "./derive";

/**
 * Templates: the list, the one write (make a page from a template) and what
 * follows it (the notice with Undo, opening the page). The route calls this
 * once above its two faces, so a press in flight is one press whichever face
 * is drawn when the window crosses 700 px, and the follow-up (the notice and
 * the navigation) is not left to a card that may have unmounted.
 */
export function useTemplatesController() {
  const router = useRouter();
  const timeZone = useTimeZone();
  const templates = useTemplates();
  const make = useCreateFromTemplate();
  const list = templates.data ?? [];
  // A second press before the first has come back would make a duplicate page;
  // `make.isPending` only changes on the next render.
  const inflight = useRef(false);

  const makePage = async (id: string, name: string) => {
    if (inflight.current || make.isPending) return;
    inflight.current = true;
    try {
      const page = await make.mutateAsync({
        templateId: id,
        title: templatePageTitle(name, newDate(), timeZone),
      });
      if (!page.result) return;
      notify.success(`Created from “${name || "Untitled"}”`, {
        action: { label: "Undo", onClick: () => void page.undo() },
      });
      router.push(`/pages/${page.result.id}`);
    } finally {
      inflight.current = false;
    }
  };

  return { templates, make, list, makePage };
}

export type TemplatesController = ReturnType<typeof useTemplatesController>;
