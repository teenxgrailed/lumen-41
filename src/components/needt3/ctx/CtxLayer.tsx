"use client";

import { Fragment, useEffect, useState } from "react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";

import { useV3PortalContainer } from "./PortalScope";
import {
  type CtxMenu,
  type CtxRow,
  ctxHeight,
  ctxMenuFor,
  openSub,
} from "./registry";
import { useExit } from "./useExit";

interface Open {
  x: number;
  y: number;
  flip: boolean;
  menu: CtxMenu;
  key: number;
}

/**
 * The app's own context menu (prototype ctx.jsx CtxLayer): plain 15px rows,
 * hairlines between groups, Delete in red, no icons. Text fields keep the
 * browser's menu. Radix gives focus, arrows and outside-click; the menu is
 * anchored to an invisible point at the pointer.
 */
export function CtxLayer() {
  const container = useV3PortalContainer();
  const [menu, setMenu] = useState<Open | null>(null);
  const [last, setLast] = useState<Open | null>(null);
  const [shown, leaving] = useExit(!!menu, 120);
  // Keyboard highlight (hover is .cx-row:hover in the vendored CSS).
  const [hot, setHot] = useState<string | null>(null);

  useEffect(() => {
    if (menu) setLast(menu);
  }, [menu]);

  useEffect(() => {
    if (!container) return undefined;
    const scope = container.closest(".needt-v3");
    function onCtx(e: MouseEvent) {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (!t || !scope?.contains(t)) return;
      if (
        t.closest(
          "input, textarea, [contenteditable=''], [contenteditable='true']"
        )
      )
        return;
      const el = t.closest<HTMLElement>("[data-ctx]");
      const groups = ctxMenuFor(el);
      if (!groups) return;
      e.preventDefault();
      const h = ctxHeight(groups);
      const x = Math.min(e.clientX, window.innerWidth - 248);
      const y = Math.min(e.clientY, window.innerHeight - h - 8);
      setMenu({ x, y, flip: y < e.clientY, menu: groups, key: Date.now() });
    }
    const shut = () => setMenu(null);
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("blur", shut);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("blur", shut);
      window.removeEventListener("resize", shut);
    };
  }, [container]);

  const m = menu ?? last;
  if (!shown || !m || !container) return null;

  const choose = (row: CtxRow) => {
    if (row.sub) {
      setMenu((cur) =>
        cur ? { ...cur, key: Date.now(), menu: openSub(row) } : cur
      );
      return;
    }
    if (row.tone === "title") return;
    setMenu(null);
    if (row.run) window.setTimeout(row.run, 0);
  };

  return (
    <Dropdown.Root
      open={!!menu}
      onOpenChange={(o) => {
        if (!o) setMenu(null);
      }}
      modal={false}
    >
      <Dropdown.Trigger asChild>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: m.x,
            top: m.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />
      </Dropdown.Trigger>
      <Dropdown.Portal container={container} forceMount>
        <Dropdown.Content
          key={m.key}
          forceMount
          side="bottom"
          align="start"
          sideOffset={0}
          avoidCollisions={false}
          className={`base-menu shell-ctx-layer-menu nx-pop${leaving ? " is-leaving" : ""}`}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "static",
            transformOrigin: m.flip ? "bottom left" : "top left",
            outline: "none",
          }}
        >
          {m.menu.map((group, gi) => (
            <Fragment key={gi}>
              {gi ? (
                <span className="base-menu-sep" aria-hidden="true" />
              ) : null}
              {group.map((row) => (
                <Dropdown.Item
                  key={row.label}
                  className="cx-row shell-ctx-layer-row"
                  disabled={row.tone === "title"}
                  onFocus={() => setHot(row.label)}
                  onBlur={() => setHot(null)}
                  onSelect={(e) => {
                    if (row.sub) e.preventDefault();
                    choose(row);
                  }}
                  style={{
                    font:
                      row.tone === "title"
                        ? "500 12px/14px var(--font-sans)"
                        : "400 15px/19px var(--font-sans)",
                    height: row.tone === "title" ? 28 : 36,
                    background: hot === row.label ? "var(--fill-3)" : undefined,
                    color:
                      row.tone === "danger"
                        ? "var(--destructive)"
                        : row.tone === "title"
                          ? "var(--text-muted)"
                          : "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  {row.label}
                  {row.hint ? (
                    <span
                      className="shell-ctx-layer-span"
                      style={{
                        font:
                          row.hint === "›"
                            ? "400 17px/1 var(--font-sans)"
                            : "var(--type-meta)",
                      }}
                    >
                      {row.hint}
                    </span>
                  ) : null}
                </Dropdown.Item>
              ))}
            </Fragment>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
