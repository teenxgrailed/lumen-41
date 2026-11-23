- Recurring agent-hub jobs no longer stall behind a run nobody finished. Each
  occurrence now has a lease (24 hours, or until the next run if sooner); one
  still unfinished then is closed as missed and the next occurrence opens on
  schedule. Creating and completing a hub item also accept an optional
  `idempotencyKey`, so a retry returns the first result instead of a duplicate
  or an error.
