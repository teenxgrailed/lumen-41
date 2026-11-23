- Recurring agent-hub jobs no longer stall behind a run nobody finished. Each
  occurrence now has a lease (24 hours, or until the next run if sooner); one
  still open or in progress then, with no agent actively holding it, is closed
  as missed (shown as "Missed") and the next occurrence opens on schedule. An
  item waiting on you or blocked is never closed this way. Creating and
  completing a hub item also accept an optional `idempotencyKey`, so a retry
  returns the first result instead of a duplicate or an error.
