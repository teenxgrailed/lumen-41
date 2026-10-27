- API routes that read a JSON body (task sync, tasks, settings, calendar and
  password reset) now answer a malformed or empty body with a 400 instead of
  a 500.
