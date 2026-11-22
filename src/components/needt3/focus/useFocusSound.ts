"use client";

import { useEffect } from "react";

import { playSound, stopSound } from "@/lib/needt3/focus-audio";

import type { FocusController } from "./useFocusController";

/**
 * Plays the chosen sound while a session is running: not while paused, not
 * over a break, not when nothing runs. It is mounted once in FocusHost, above
 * the desktop / phone switch, so closing or minimising the window never cuts
 * the sound and the two faces share one player. It keeps playing in a hidden
 * tab on purpose: that is where people go to work.
 */
export function useFocusSound(ctl: FocusController) {
  const run = ctl.run;
  const live = !!run && !run.isBreak && !run.paused;
  const want = live ? ctl.sound : "off";
  useEffect(() => {
    void playSound(want);
  }, [want]);
  useEffect(() => () => stopSound(), []);
}
