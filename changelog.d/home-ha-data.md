- The three focuses picked in the Sunday review are now saved for the week
  ahead (`/api/week-focus`, documented in the Connector API) and become the
  first candidates for the day's highlight.
- Highlight suggestions come with a one-line reason each. With Pro, the agent
  picks and words them (`/api/ai/highlight-suggestions`, once a day, counted as
  one AI action); without it the same suggestions come from the usual rules.
- The morning brief now shows until 11:00 or the first task you finish,
  whichever comes first (it was until noon).
- The first-event line on Home no longer says when to leave: Needt has no real
  travel time, so it shows only the weather and the first event.
