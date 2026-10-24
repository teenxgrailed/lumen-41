- New 18-screen onboarding at `/start` (desktop and phone): pick your areas,
  tasks and repeats, rank what matters, set your days and rhythm, watch Needt
  plan next week with the real scheduler, then save it with an account. The
  answers, the plan preview and the final write are all in the API
  (`POST /api/onboarding/plan`, `GET`/`PUT /api/onboarding/answers`,
  `POST /api/onboarding/commit`).
- The 14-day Pro gift starts when the email is confirmed. Choosing Pro or
  Lifetime asks for a card through Creem (Pro is charged when the gift ends,
  Lifetime now); Free needs no card, and "Continue without a subscription"
  keeps the gift and then drops to Free. Checkout stays behind the billing flag.
