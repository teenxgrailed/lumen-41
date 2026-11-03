# Mac App Store listing for Needt

Same layout and fields as `apps/ios/store/README.md` (`fastlane deliver --metadata_path
apps/macos/store/metadata` can read it). Files that differ from iPhone: `description.txt`
(menu bar, Quick add, Share extension, Siri and Shortcuts, Spotlight, widgets, Dock
badge), `promotional_text.txt`, `release_notes.txt`, and `review-notes.md` (system-browser
sign-in, Mac-specific things to try). The name, subtitle, keywords, URLs and categories are
the same as on iPhone.

- App privacy answers: `apps/ios/store/app-privacy.md` (same server, same notice).
- Age rating: `apps/ios/store/age-rating.md` (same answers, same 16+ override).
- Screenshots: the `needt-store-screenshots` artifact of `.github/workflows/store-screenshots.yml`,
  files `mac_2880x1800_*.png`.
- Bundle ids and signing: `apps/macos/README.md`, "Mac App Store" (`NeedtAppStoreLite` by default, `NeedtAppStore` with the island,
  `app.needt.mac`; needs the owner's Apple Developer team).
- Limits: name 5 of 30, subtitle 30 of 30, keywords 96 of 100, promotional text 150 of 170,
  description 2085 of 4000.
