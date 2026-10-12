"use client";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { AIActionCursor } from "@/components/ai/AIActionCursor";
import { AIChatOverlay } from "@/components/ai/AIChatOverlay";
import { AICompanion } from "@/components/ai/AICompanion";
import { DndProvider } from "@/components/dnd/DndProvider";
import { AppNav } from "@/components/navigation/AppNav";
import { NeedtAppShell } from "@/components/needt/shell/NeedtAppShell";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { SetupCheck } from "@/components/setup/SetupCheck";
import { CommandPalette } from "@/components/ui/command-palette";
import { CommandPaletteFab } from "@/components/ui/command-palette-fab";
import { CommandPaletteHint } from "@/components/ui/command-palette-hint";
import { ShortcutsModal } from "@/components/ui/shortcuts-modal";
import { NeedtNotices } from "@/components/needt/corner/NeedtNotices";
import { TooltipProvider } from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";

import { usePageTitle } from "@/hooks/use-page-title";

import { useShortcutsStore } from "@/store/shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  const pathname = usePathname();
  const { isOpen: shortcutsOpen, setOpen: setShortcutsOpen } =
    useShortcutsStore();

  const hideAurora = ["/calendar", "/settings"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  usePageTitle();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      } else if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setChatOverlayOpen((open) => !open);
      } else if (event.key === "?" && !(event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setShortcutsOpen]);

  return (
    <div
      className={cn(
        "needt-page-depth relative flex min-h-dvh",
        /* The shell's root is `height: 100%`, and a percentage height needs
           a definite one above it — against `min-h-dvh` alone it resolves to
           the content and the whole page collapses. */
        "h-dvh overflow-hidden",
        (pathname === "/today" || pathname.startsWith("/moodboards/")) &&
          "xl:h-dvh xl:overflow-hidden"
      )}
    >
      <div
        className={cn("needt-aurora", hideAurora && "needt-aurora--hidden")}
        aria-hidden="true"
      >
        <span className="needt-aurora-blob" />
        <span className="needt-aurora-blob" />
        <span className="needt-aurora-blob" />
      </div>
      <PrivacyProvider>
        <DndProvider>
          <TooltipProvider delayDuration={400}>
            <SetupCheck />
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
            />
            {!pathname.startsWith("/auth/") && <CommandPaletteHint />}
            <CommandPaletteFab />
            <ShortcutsModal
              isOpen={shortcutsOpen}
              onClose={() => setShortcutsOpen(false)}
            />
            {/* One tree at every width: the shell's own rail hides itself
                below `lg` and this dock takes over there. Choosing between
                them in JavaScript remounted the page once after hydration on
                every phone and tablet, which cancelled any navigation in
                flight.

                The phone is the design's own bottom bar now
                (`NeedtMobileTabs`, inside `NeedtAppShell`), so this dock is
                the tablet's alone. The design has no tablet bar to port. */}
            <div className="hidden sm:block lg:hidden">
              <AppNav onOpenChatOverlay={() => setChatOverlayOpen(true)} />
            </div>
            <NeedtAppShell
              onOpenPalette={() => setCommandPaletteOpen(true)}
            >
              <main
                className={cn(
                  "needt-route-content relative min-h-0 min-w-0 flex-1 max-lg:pb-[calc(68px+env(safe-area-inset-bottom))] max-sm:pb-[calc(92px+env(safe-area-inset-bottom))]",
                  pathname.startsWith("/settings") &&
                    "max-lg:h-dvh max-lg:overflow-hidden max-lg:pb-0",
                  (pathname === "/today" ||
                    pathname.startsWith("/moodboards/")) &&
                    "xl:h-dvh xl:min-h-0 xl:overflow-hidden"
                )}
              >
                <NotificationProvider>
                  <div
                    key={pathname}
                    className={cn(
                      "needt-mobile-route-fallback relative z-[1] min-h-full",
                      (pathname === "/today" ||
                        pathname.startsWith("/moodboards/")) &&
                        "xl:h-full xl:min-h-0 xl:overflow-hidden"
                    )}
                  >
                    {children}
                  </div>
                </NotificationProvider>
              </main>
            </NeedtAppShell>
            <AIChatOverlay
              open={chatOverlayOpen}
              onOpenChange={setChatOverlayOpen}
            />
            <AICompanion
              hidden={chatOverlayOpen}
              onOpenChat={() => setChatOverlayOpen(true)}
            />
            <AIActionCursor />
            <NeedtNotices />
          </TooltipProvider>
        </DndProvider>
      </PrivacyProvider>
    </div>
  );
}
