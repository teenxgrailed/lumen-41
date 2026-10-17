"use client";

/* The onboarding controller: every piece of state and every write, with no
   markup. The desktop screen (OnboardingScreen) and the phone's (PhoneSetup)
   are two faces on this one hook, so the write guards live in one place:

   - prefs are replaced whole on the server, so a patch is merged into the
     loaded map only; with no settings loaded, `setPref` refuses instead of
     wiping every other key;
   - working hours are written by the per-day editor itself, only once the
     saved schedule has loaded and only for a valid week (`saveWeek`);
   - only steps the person stood on are saved on the way out;
   - finishing creates the sample day (POST /api/onboarding/sample) for the
     FIRST use picked, once; Skip creates nothing;
   - nothing here creates an account or enters a credential. */
import * as React from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { takePostAuthPath } from "@/lib/auth/post-auth-path";
import { logger } from "@/lib/logger";
import { useSchedule, useUpdateSchedule } from "@/lib/needt3/hooks/account";
import { useConnections } from "@/lib/needt3/hooks/connections";
import { browserTimeZone, fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { useSettings, useUpdateSettings } from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";
import { useOnline } from "@/lib/needt3/use-online";
import { notify } from "@/lib/notifications";
import { type WeekHours, legacyColumns, weekIsValid } from "@/lib/work-week";

import { CALS } from "./onboarding-data";
import {
  STEPS,
  clampStep,
  goTo,
  startZone,
  stepIndex,
  stepsFor,
  toggleUse,
  zoneChoices,
} from "./onboarding-steps";

const LOG_SOURCE = "needt3-onboarding";

export const ZONES = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
];
export const zoneLabel = (z: string) => z.replace(/_/g, " ");

export type OnboardingUi = "phone" | "desktop";

export type ImportSource = "todoist" | "notion";

interface IntegrationStatus {
  google?: { configured?: boolean };
  outlook?: { configured?: boolean };
}

interface ImportsState {
  enabled?: boolean;
  sources?: Partial<Record<ImportSource, { configured?: boolean }>>;
}

export const IMPORT_SOURCES: ReadonlyArray<{
  id: ImportSource;
  label: string;
  sub: string;
}> = [
  {
    id: "todoist",
    label: "Todoist",
    sub: "Projects, sections, tasks and labels",
  },
  {
    id: "notion",
    label: "Notion",
    sub: "Pages and databases you pick in Notion",
  },
];

export function useOnboarding({
  startAt,
}: {
  startAt?: string | null;
  /** Which face is drawing (kept so both faces call the hook the same way). */
  ui?: OnboardingUi;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const settings = useSettings();
  const update = useUpdateSettings();
  const connections = useConnections();
  const schedule = useSchedule();
  const setSchedule = useUpdateSchedule();

  /* Which providers this server can actually run. A failed read shows only
     what needs no keys (iCloud) and no Import step. */
  const status = useQuery({
    queryKey: [...qk.all(), "onboarding-providers"],
    queryFn: () => fetchJson<IntegrationStatus>("/api/integration-status"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const imports = useQuery({
    queryKey: qk.imports(),
    queryFn: () => fetchJson<ImportsState>("/api/imports"),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const calendars = React.useMemo(
    () =>
      CALS.filter(
        (c) => c.needs === null || !!status.data?.[c.needs]?.configured
      ),
    [status.data]
  );
  const importSources = React.useMemo(
    () =>
      imports.data?.enabled
        ? IMPORT_SOURCES.filter(
            (s) => !!imports.data?.sources?.[s.id]?.configured
          )
        : [],
    [imports.data]
  );
  const ids = React.useMemo(
    () => stepsFor(importSources.length > 0),
    [importSources.length]
  );
  const count = ids.length;

  const [i, setI] = React.useState(() =>
    clampStep(stepIndex(startAt || "use"), 3)
  );
  const [dir, setDir] = React.useState<1 | -1>(1);
  /* In the order picked: the first one drives the sample day. */
  const [uses, setUses] = React.useState<string[]>([]);
  const [tz, setTz] = React.useState("");
  const [skipCal, setSkipCal] = React.useState(false);
  const [guide, setGuide] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const seeded = React.useRef(false);
  /* Steps the person actually stood on; only these are saved on the way out. */
  const visited = React.useRef(new Set<string>());
  const ready = !!settings.data;
  const at = Math.min(i, count - 1);
  const id = ids[at];
  const step = STEPS.find((s) => s[0] === id) ?? STEPS[0];
  visited.current.add(id);

  React.useEffect(() => {
    if (seeded.current || !settings.data) return;
    seeded.current = true;
    const s = settings.data;
    setTz(startZone(s.timeZone, browserTimeZone(), s.prefs.onboarded === true));
    if (Array.isArray(s.prefs.uses))
      setUses(s.prefs.uses.filter((u): u is string => typeof u === "string"));
  }, [settings.data]);

  const week = schedule.data?.weekHours ?? [];
  const weekReady = !!schedule.data;
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

  /** The per-day editor's write: never before the schedule loaded, never invalid. */
  const saveWeek = React.useCallback(
    (next: WeekHours) => {
      if (!weekReady || !weekIsValid(next)) return;
      void setSchedule.mutateAsync({ weekHours: next, ...legacyColumns(next) });
    },
    [weekReady, setSchedule]
  );

  const toggleUsePick = (u: string) => setUses((l) => toggleUse(l, u));

  /** What a step decided is written when you leave it (forward). */
  async function save(k: string) {
    try {
      if (k === "use" && uses.length) await setPref({ uses });
      if (k === "hours" && settings.data && tz && tz !== settings.data.timeZone)
        await update.mutateAsync({ timeZone: tz });
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
    const to = goTo({ from: at, to: n, count });
    if (to > at)
      for (let k = at; k < to; k++)
        if (visited.current.has(ids[k])) await save(ids[k]);
    setDir(to > at ? 1 : -1);
    setI(to);
  }

  /** Whether Continue is allowed on the step on screen. */
  const canContinue = ready && (id !== "use" || uses.length > 0);

  /** The sample day for the first pick, once. A failure never blocks Today. */
  async function createSample() {
    if (!uses.length) return;
    try {
      await sendJson("/api/onboarding/sample", "POST", {
        uses,
        ...(tz ? { timeZone: tz } : {}),
      });
      await qc.invalidateQueries({ queryKey: qk.sample() });
    } catch (error) {
      void logger.warn(
        "Sample day not created",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  }

  async function finish(skipped?: boolean) {
    if (planning || !ready) return;
    setPlanning(true);
    if (!skipped) {
      await save("use");
      await save("hours");
      await createSample();
    }
    try {
      await setPref({ onboarded: true });
    } catch {
      /* Today still opens; setup can be shown again */
    }
    // A buy link that sent this person to sign up goes on where it was going.
    router.push(takePostAuthPath() ?? "/today");
  }

  /** Leaves for a provider's own screen; what was chosen so far is kept. */
  function leaveTo(go: () => void | Promise<void>) {
    void save("use")
      .then(() => save("hours"))
      .then(go);
  }

  function connect(href: string) {
    leaveTo(() => {
      window.location.assign(href);
    });
  }

  function startImport(source: ImportSource) {
    leaveTo(async () => {
      try {
        const { authorizeUrl } = await sendJson<{ authorizeUrl: string }>(
          "/api/imports",
          "POST",
          { source }
        );
        window.location.assign(authorizeUrl);
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : "Could not start the import."
        );
      }
    });
  }

  return {
    i: at,
    dir,
    id,
    ids,
    count,
    step,
    online,
    ready,
    uses,
    toggleUse: toggleUsePick,
    tz,
    setTz,
    zoneOptions,
    skipCal,
    setSkipCal,
    guide,
    setGuide,
    calendars,
    importSources,
    week,
    weekReady,
    saveWeek,
    canContinue,
    planning,
    connected,
    go,
    finish,
    connect,
    startImport,
  };
}

export type Onboarding = ReturnType<typeof useOnboarding>;
