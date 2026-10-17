- The desktop top bar now shows the offline pill, and status banners appear
  under it: "Google Calendar / Gmail access was revoked" with Reconnect (when
  every calendar of an account fails to sync, or a mailbox is in error),
  "AI paused" when the monthly AI allowance is spent, and "AI is temporarily
  unavailable" when no AI key is configured for the person or the server.
  `GET /api/accounts` gains `needsReconnect`.
