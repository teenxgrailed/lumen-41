"use client";

import { Suspense, lazy, useState } from "react";

import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  useHideStarterGame,
  useStarterGameStatus,
} from "@/lib/needt3/hooks/starter-game";
import type { StarterScreen } from "@/lib/starter-game";

import { openPaywall } from "../paywall/store";
import { usePhoneUi } from "../root/phone-ui-context";
import { SgEntry } from "./SgEntry";

/** The game is loaded when it is started, not with every screen. */
const SgGame = lazy(() =>
  import("./SgGame").then((m) => ({ default: m.SgGame }))
);

/**
 * Whether the entry card is (or is about to be) on this screen. A screen that
 * has an empty state of its own hides it while this is true, so the card takes
 * its place: `show` = the card is drawn, `hold` = the answer is not in yet and
 * the empty state should wait for it rather than flash and be replaced.
 */
export function useStarterGameCard() {
  const status = useStarterGameStatus();
  return {
    show: status.data?.eligible === true,
    hold: status.isPending,
  };
}

/**
 * THE STARTER GAME SLOT. One small mount point per screen:
 * `<StarterGameSlot screen="home" />` where the empty state is. It draws the
 * entry card when the server says so (fewer than five open tasks, not hidden)
 * and owns the game that the card starts, so the game does not close when the
 * card goes (the tasks it creates make the card leave).
 */
export function StarterGameSlot({ screen }: { screen: StarterScreen }) {
  const status = useStarterGameStatus();
  const plan = usePlan();
  const hide = useHideStarterGame();
  const phone = usePhoneUi() === "phone";
  const [open, setOpen] = useState(false);

  const data = status.data;
  const locked = data ? !data.canPlay : false;
  return (
    <>
      {data?.eligible ? (
        <div className={phone ? "sg-phone" : "sg-desk"}>
          <SgEntry
            entry={screen}
            locked={locked}
            upgradeLabel={
              plan.data?.trialEligible
                ? "Try with Pro · 14 days free"
                : "Try with Pro"
            }
            onStart={() => setOpen(true)}
            onUpgrade={() => openPaywall("Starter game")}
            onHide={(how) => hide.mutate(how)}
          />
        </div>
      ) : null}
      {open ? (
        <Suspense fallback={null}>
          <SgGame entry={screen} phone={phone} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
