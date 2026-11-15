- Sign-in pages no longer show notifications or toasts: the nudge poll stays
  quiet there and the notice bridge drops anything raised on /auth/*. Elsewhere
  a poll raises one card at a time and points to the rest in the inbox.
- A refused email and password now says it may be a Google or code account and
  offers "Send me a code", which opens the code form with the address filled in
  and sends the code. The message is the same for every address, so it does not
  reveal whether an account exists. The resend-confirmation answer sits under
  its button instead of in a toast.
- "Continue with Google" on the phone sign-in keeps its full height instead of
  being clipped by the card, and has a hairline edge on both themes.
- Settings, Menu on the phone: the pill's "holds three" message appears in the
  page's own hint instead of a toast over the rows, and a saved place with no
  row no longer holds a slot invisibly.
