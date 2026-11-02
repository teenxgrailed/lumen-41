- Email: the unsubscribe link in a mail now opens a confirm page and changes
  nothing until you press Unsubscribe, so mail scanners that prefetch links
  cannot unsubscribe anyone; the one-click request from your mail app still
  unsubscribes at once. Bounced and complaining addresses (Resend webhook,
  `POST /api/webhooks/resend`, needs `RESEND_WEBHOOK_SECRET`) are put on a
  suppression list and get no more optional mail. A mail never shows a
  placeholder address in its footer any more. Adds two tables (additive).
