# Deterministic scheduling contract

- `availableFrom`, `startDate`, and `postponedUntil` are independent lifecycle
  boundaries. A task cannot start before the latest non-null boundary.
- A soft `deadline` (and the due date it follows) is searched first as a
  boundary: the scheduler takes any work-hours slot that ends before it, relaxing
  the daily deep-work limit if that is what it takes. A date-only due date
  (UTC midnight) means the whole day in the person's zone. Only when no such
  slot exists is the task placed at the earliest slot after it, and it is
  reported in `ScheduleResult.atRisk` (`DEADLINE_AT_RISK`) rather than dropped.
- Scheduling runs for one person are serial (`user-schedule-lock.ts`): an
  in-process queue plus a Postgres advisory lock held for the whole run.
- `hardDeadline` makes `deadline` a strict completion boundary. The scheduler
  may use otherwise free time outside the selected Work Schedule only when the
  task cannot fit inside its schedule, and no generated block may end after the
  deadline.
- `isFrozen` and `scheduleLocked` describe manual placement; neither implies a
  hard deadline.
