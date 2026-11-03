- The Mac App Store build (`NeedtAppStore`) is ready to sign and upload: CI now
  archives it unsigned for arm64 and x86_64 and checks the archive, it carries
  privacy manifests, only the permission texts and entitlements it uses, no
  purchase or Help-menu website link, and tells the web app which build it is
  through `window.__needtNative.distribution`. Its island is the Needt modules
  plus calendar, reminders and music through AppleScript: no weather, lyrics,
  Spotify web sign-in, downloads, Screen Assistant, LocalSend, subprocesses or
  location permission.
