- Every enabled calendar now blocks scheduling, including the Needt calendar
  that MCP-created events land in and calendars added after the settings were
  saved; only a calendar you switch off is ignored. Planned tasks no longer sit
  inside such an event.
- CalDAV calendars sync every 15 minutes in the background, and a calendar that
  keeps failing shows "Calendar sync failing" in Connections instead of going
  quiet. A finished sync job no longer stops the next one from being queued.
