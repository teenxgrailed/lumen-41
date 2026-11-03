- CalDAV requests now re-check the server address on every sync and edit, secrets
  are compared in constant time, and unknown API addresses answer 404 instead
  of the "Not found" page.
