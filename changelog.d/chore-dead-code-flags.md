- Removed the pre-v3 UI now that design v3 is on for everyone: the
  `design_v3` flag branches (every signed-in route is the v3 frame; the sign-in,
  reset-password and confirm-email screens are v3), the old needt v2 screens
  (Today, Calendar, Workspace, Docs, Settings, mobile, auth), the old settings
  panels, task modal, boards UI, and the tests and visual baselines that only
  covered them. The `design_v3` FeatureFlag row stays in the database.
