import AppKit
import os
#if canImport(Sparkle) && !APPSTORE
import Sparkle
#endif

/// Sparkle 2 auto-update. Stays off until the Sparkle EdDSA *public* key is
/// put in the `SPARKLE_PUBLIC_ED_KEY` build setting (see README.md): an
/// update channel with no key to verify it against must not run. Checks run
/// automatically once a day (`SUScheduledCheckInterval` in Info.plist).
@MainActor
final class Updater {
    static let shared = Updater()

    private static let log = Logger(subsystem: "app.needt.mac", category: "Updater")

    #if canImport(Sparkle) && !APPSTORE
    private var controller: SPUStandardUpdaterController?
    #endif

    /// The public key from Info.plist, or nil while it is unset.
    static var publicKey: String? {
        let value = (Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
        return value
    }

    /// "1.2.3 (45)" for Settings.
    static var versionString: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    /// False in the App Store build (the store updates it).
    static var isAvailableInThisBuild: Bool {
        #if canImport(Sparkle) && !APPSTORE
        return true
        #else
        return false
        #endif
    }

    var isConfigured: Bool {
        #if canImport(Sparkle) && !APPSTORE
        return Updater.publicKey != nil
        #else
        return false
        #endif
    }

    func start() {
        #if canImport(Sparkle) && !APPSTORE
        guard controller == nil else { return }
        guard Updater.publicKey != nil else {
            Updater.log.notice("Updates are off: SUPublicEDKey is not set in this build")
            return
        }
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        Updater.log.notice("Updates are on, version \(Updater.versionString, privacy: .public)")
        #endif
    }

    func checkForUpdates() {
        #if canImport(Sparkle) && !APPSTORE
        controller?.checkForUpdates(nil)
        #endif
    }
}
