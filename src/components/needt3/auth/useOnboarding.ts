"use client";

/* The onboarding controller: every piece of state and every write, with no
   markup. The desktop screen (OnboardingScreen) and the phone's (PhoneSetup)
   are two faces on this one hook, so the write guards live in one place:

   - prefs are replaced whole on the server, so a patch is merged into the
     loaded map only; with no settings loaded, `setPref` refuses instead of
     wiping every other key;
   - the saved working hours are loaded before anything is written, and hours
     are sent only when they changed (`hoursPatch`);
   - only steps the person stood on are saved on the way out (`stepsToSave`);
   - nothing here creates an account or enters a credential. */
import * as React from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import { takePostAuthPath } from "@/lib/auth/post-auth-path";
import { logger } from "@/lib/logger";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { browserTimeZone, fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { useSettings, useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { useCreateTask } from "@/lib/needt3/hooks/tasks";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { useOnline } from "@/lib/needt3/use-online";
import { notify } from "@/lib/notifications";

import { menuTilesFrom } from "../phone/menu/places";
import { PLACES } from "../shell/places";
import {
  DEFAULT_HOURS,
  HOUR_CHOICES,
  STEPS,
  badHours,
  clampStep,
  goTo,
  hhmm,
  hoursPatch,
  startOrder,
  startZone,
  stepIndex,
  stepsToSave,
  zoneChoices,
} from "./onboarding-steps";
import { menuToPrefs, prefsToMenu } from "./phone-menu-pick";

const LOG_SOURCE = "needt3-onboarding";

interface HoursRow {
  workHourStart?: number;
  workHourEnd?: number;
}

export const ZONES = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
];
export const zoneLabel = (z: string) => z.replace(/_/g, " ");

export type OnboardingUi = "phone" | "desktop";

export function useOnboarding({
  startAt,
  ui,
}: {
  startAt?: string | null;
  /** Which face is drawing: it decides which tile list the third step saves. */
  ui: OnboardingUi;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const settings = useSettings();
  const update = useUpdateSettings();
  const createTask = useCreateTask();
  const connections = useConnections();

  const [i, setI] = React.useState(() =>
    clampStep(stepIndex(startAt || "use"))
  );
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [uses, setUses] = React.useState<string[]>(["work"]);
  const [start, setStart] = React.useState<number>(DEFAULT_HOURS.start);
  const [end, setEnd] = React.useState<number>(DEFAULT_HOURS.end);
  /* The hours as saved on the server; null until that row has loaded. Until
     then the selects show defaults and nothing is written from them. */
  const [savedHours, setSavedHours] = React.useState<{
    start: number;
    end: number;
  } | null>(null);
  const [tz, setTz] = React.useState("");
  const [skipCal, setSkipCal] = React.useState(false);
  const [tiles, setTiles] = React.useState<string[]>(() =>
    PLACES.map((p) => p.id)
  );
  /* The phone's pill: three places (phone/menu/places.ts MenuPlaceId). */
  const [menu, setMenu] = React.useState<string[]>(() => prefsToMenu(null));
  const [title, setTitle] = React.useState("");
  const [first, setFirst] = React.useState<V3Task | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const seeded = React.useRef(false);
  /* Steps the person actually stood on; only these are saved on the way out. */
  const visited = React.useRef(new Set<string>());
  const ready = !!settings.data;

  /* Start from what is already saved: hours from the scheduler's settings, the
     zone from settings (else this device's), the tile order from the prefs. */
  React.useEffect(() => {
    if (seeded.current || !settings.data) return;
    seeded.current = true;
    const s = settings.data;
    setTz(startZone(s.timeZone, browserTimeZone(), s.prefs.onboarded === true));
    setTiles(
      startOrder(
        PLACES.map((p) => p.id),
        s.prefs.sidebarTiles
      )
    );
    setMenu(prefsToMenu(menuTilesFrom(s.prefs)));
    if (Array.isArray(s.prefs.uses))
      setUses(s.prefs.uses.filter((u): u is string => typeof u === "string"));
    void fetchJson<HoursRow>("/api/auto-schedule-settings")
      .then((row) => {
        const a =
          typeof row.workHourStart === "number"
            ? row.workHourStart
            : DEFAULT_HOURS.start;
        const b =
          typeof row.workHourEnd === "number"
            ? row.workHourEnd
            : DEFAULT_HOURS.end;
        setStart(a);
        setEnd(b);
        setSavedHours({ start: a, end: b });
      })
      .catch(() => undefined);
  }, [settings.data]);

  const step = STEPS[i];
  const id = step[0];
  React.useEffect(() => {
    visited.current.add(id);
  }, [id]);
  const bad = badHours(start, end);
  const connected = new Set(
    (connections.data ?? [])
      .filter((c) => c.kind === "calendar")
      .map((c) => c.provider)
  );
  const zoneOptions: ReadonlyArray<readonly [string, string]> = React.useMemo(
    () =>
      zoneChoices(ZONES, browserTimeZone(), settings.data?.timeZone).map(
        (z) => [z, zoneLabel(z)] as const
      ),
    [settings.data?.timeZone]
  );

  /* prefs is replaced whole on the server, so a patch is only ever merged
     into the loaded map. With nothing loaded, writing would wipe every other
     key; refuse instead. */
  const setPref = React.useCallback(
    (patch: Record<string, unknown>) => {
      const cur = qc.getQueryData<{ prefs: Record<string, unknown> }>(
        qk.settings()
      )?.prefs;
      if (!cur || typeof cur !== "object")
        return Promise.reject(new Error("Settings are not loaded yet"));
      return update.mutateAsync({ prefs: { ...cur, ...patch } });
    },
    [qc, update]
  );

  /** What a step decided is written when you leave it (forward). */
  async function save(k: string) {
    try {
      if (k === "use") await setPref({ uses });
      if (k === "setup") {
        const body = hoursPatch({
          loaded: !!savedHours,
          start,
          end,
          savedStart: savedHours?.start ?? start,
          savedEnd: savedHours?.end ?? end,
        });
        if (body) {
          await sendJson("/api/auto-schedule-settings", "PATCH", body);
          setSavedHours({ start: body.workHourStart, end: body.workHourEnd });
        }
        if (settings.data && tz && tz !== settings.data.timeZone)
          await update.mutateAsync({ timeZone: tz });
      }
      if (k === "sidebar") {
        if (ui === "phone") await setPref({ mobileTiles: menuToPrefs(menu) });
        else await setPref({ sidebarTiles: tiles });
      }
    } catch (error) {
      void logger.warn(
        "Onboarding step not saved",
        {
          step: k,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      notify.error("Could not save that step. You can change it in Settings.");
    }
  }

  async function go(n: number) {
    const to = goTo({ from: i, to: n, start, end, hasFirst: !!first });
    if (to === null) return;
    if (to > i)
      for (const k of stepsToSave(i, to, visited.current)) await save(k);
    setDir(to > i ? 1 : -1);
    setI(to);
  }

  /** The third step's own Skip: back to the defaults, on to the next step. */
  function skipTiles() {
    setTiles(PLACES.map((p) => p.id));
    setMenu(prefsToMenu(null));
    setDir(1);
    setI(i + 1);
  }

  async function addTask() {
    const t = title.trim();
    if (!t || adding || !online) return;
    setAdding(true);
    try {
      const { result } = await createTask.mutateAsync({
        draft: { title: t, estimatedMinutes: 30, auto: true },
      });
      setFirst(result);
      setDir(1);
      setI(stepIndex("placed"));
    } catch {
      /* the mutation already told the person and rolled back */
    } finally {
      setAdding(false);
    }
  }

  async function finish(skipped?: boolean) {
    if (planning || !ready) return;
    setPlanning(true);
    if (!skipped) await save(id);
    try {
      await setPref({ onboarded: true });
    } catch {
      /* Home still opens; setup can be shown again */
    }
    // A buy link that sent this person to sign up goes on where it was going.
    router.push(takePostAuthPath() ?? "/today");
  }

  function connect(href: string) {
    /* Leaves for the provider's consent screen; what was chosen so far is kept. */
    void save("use")
      .then(() => save("setup"))
      .then(() => {
        window.location.assign(href);
      });
  }

  const hours = `${hhmm(start)}–${hhmm(end)}`;
  const hourOpts = HOUR_CHOICES.map((h) => [String(h), hhmm(h)] as const);

  return {
    i,
    dir,
    id,
    step,
    online,
    ready,
    uses,
    setUses,
    start,
    setStart,
    end,
    setEnd,
    bad,
    tz,
    setTz,
    zoneOptions,
    skipCal,
    setSkipCal,
    tiles,
    setTiles,
    menu,
    setMenu,
    title,
    setTitle,
    first,
    adding,
    planning,
    connected,
    hours,
    hourOpts,
    go,
    skipTiles,
    addTask,
    finish,
    connect,
  };
}

export type Onboarding = ReturnType<typeof useOnboarding>;
