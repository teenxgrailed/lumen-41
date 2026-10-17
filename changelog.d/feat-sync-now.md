- Connections: "Sync now" on a connected calendar or mailbox (the card menu on
  the desktop, the account sheet on the phone). It queues the worker's sync job
  (`POST /api/accounts/:id/sync` for calendars, the existing
  `POST /api/mail/sync` for mail) and says the sync started.
