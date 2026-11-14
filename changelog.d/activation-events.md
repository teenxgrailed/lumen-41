- Admin Overview shows an activation card: how many external users (admins and
  sandbox accounts excluded) created an account, connected a calendar, created
  a task, were shown a replan, pressed Keep, pressed Undo and used "Fill it" in
  the last 7 and 14 days. Backed by a new additive `ActivationEvent` table
  (account_created is backfilled from sign-up dates); the same events go to
  Umami from the server with a pseudonymous id and no email, name or IP.
- Privacy Notice: discloses the product events (Section 2), the Do Not Track
  scope, and the cookie line.
