- Connector token API for widgets: `GET /api/connect/today` (one payload:
  counts, next task, Daily Highlight, habits, next event, next personal-time
  block, free minutes, weather line), `GET /api/connect/highlight`,
  `GET /api/connect/habits/today` and `POST /api/connect/habits/:id/toggle-today`.
  "Today" is the day in your saved time zone.
