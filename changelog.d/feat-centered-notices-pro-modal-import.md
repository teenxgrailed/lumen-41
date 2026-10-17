- What you just did ("Focus started · 25 min on …", "Placed at 14:00 · 3 Sep
  [Undo]") now appears as a compact pill at the bottom centre, inverted against
  the page: dark on Light, white on Dark, and on the phone above the bottom
  bar. The Ask Needt corner still carries Needt's own nudges. This also fixes
  confirmations and errors never showing on the phone.
- The Pro sheet ("Get more out of Needt") now opens from every locked PRO pill,
  Plan my day and Week load on Home, instead of sending you to Settings. For a
  Free account that has not had a trial its button reads "Start 14-day free
  trial" and starts it without a card (`POST /api/billing/trial`), also in
  Settings › Plan and on the phone. Paid plans still say checkout opens soon
  while `billing_checkout` is off.
- The sidebar has an Import button next to Create. A CSV of tasks imports now;
  From Notion starts the Notion import when it is set up. Markdown files,
  Google Docs and calendar files (.ics) are listed as "Soon": nothing backs
  them yet.
