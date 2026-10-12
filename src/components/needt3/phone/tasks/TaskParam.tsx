"use client";

import { useEffect } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { usePhoneOverlays } from "../overlays/store";

/**
 * `?task=<id>` opens that task's sheet (the desktop opens its dialog on the
 * same param, and other screens and links still send people to
 * `/tasks?task=…`). The param is taken once and removed, so closing the
 * sheet does not bring it back.
 */
export function TaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openTask = usePhoneOverlays((s) => s.openTask);
  const id = params?.get("task") ?? null;
  useEffect(() => {
    if (!id) return;
    openTask(id);
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("task");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : (pathname ?? "/"), {
      scroll: false,
    });
    // the param is read once per value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
