# Memories: the Privacy text needs a paragraph

Needt now has an opt-in "Let Needt learn about me" switch (Settings, Memories;
off by default). The legal pages are owned by the owner and were not touched.
`src/lib/legal/documents/privacy.ts` still describes Memories as "short notes
the assistant keeps about your preferences" and `subprocessors.ts` mentions
Memories only in passing. Both need a "Memories" paragraph that says:

- It is off until the person turns it on, and turning it off stops both
  learning and use; the person chooses whether to keep or delete what exists.
- What it may learn, only while on: work habits computed from their own tasks
  (usual hours for focused work, real time against estimates, heavy weekdays);
  preferences they tell Ask; short facts taken from recently edited documents
  and from email subjects and senders. Email bodies are never read.
- The document and email-metadata step sends excerpts (up to 8 documents of
  1,500 characters, 40 subject and sender pairs) to the hosted AI provider, or
  to the person's own key, at most once a day.
- Memories are per user and workspace, stored encrypted, exported with the
  rest of their data, and deleted with the account. They can be listed,
  edited and deleted in Settings, through `/api/ai/memories` and over MCP.
- Retention row: "Memories: until you delete them or your account" (exists).
