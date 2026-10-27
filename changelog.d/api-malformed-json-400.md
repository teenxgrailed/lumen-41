- API routes that read a JSON body now answer a malformed or empty body with
  the same 400 validation error as a missing field, instead of a 500.
