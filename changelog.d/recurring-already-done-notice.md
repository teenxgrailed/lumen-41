- Ticking a repeating task a second time on the same day now says so ("Already
  done today. Next time: Sun 1 Nov") and puts the circle back, instead of doing
  nothing. The task API and the connector answer with `recurringAlreadyDone`
  (`nextDueDate`) for that case, so external callers are told too.
