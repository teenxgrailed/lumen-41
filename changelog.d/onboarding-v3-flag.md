- New accounts can start in the 18-screen `/start` onboarding instead of
  `/setup`, behind the server flag `onboarding_v3` (off by default; per-user
  overrides apply). Finishing either flow now records
  `User.onboardingCompletedAt`, and someone the flag is on for who opens Today
  with nothing set up is sent into the flow once, then sees a banner they can
  close. Admins can list every flag at `GET /api/admin/feature-flags` and turn
  on a flag that has no row yet.
