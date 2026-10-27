- First-load requests no longer race to create the personal workspace and
  appearance settings, and a tab left open across an update now offers a
  reload instead of silently failing. Requests that send a build id as a
  server action id are refused at the edge. Operators: if action ids must
  stay stable across deploys, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (a
  base64 AES key, the same on every replica); no value is committed.
