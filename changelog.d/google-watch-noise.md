- Calendar push registration no longer retries Google calendars that cannot
  push (holiday, birthday, read-only subscribed) every cycle: they are marked
  once and left to normal sync, and disabled feeds are skipped.
