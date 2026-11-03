- Server and edge errors are now reported to Sentry. The hook that starts
  Sentry was in a place Next never loads, so only browser errors arrived.
