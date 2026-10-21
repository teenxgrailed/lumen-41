import AppKit
#if canImport(Sparkle)
import Sparkle
#endif

/// Sparkle 2 auto-update. Stays off until the Sparkle EdDSA *public* key is
/// put in the `SPARKLE_PUBLIC_ED_KEY` build setting (see README.md): an
/// update channel with no key to verify it against must not run.
@MainActor
final class Updater {
    static let shared = Updater()

    #if canImport(Sparkle)
    private var controller: SPUStandardUpdaterController?
    #endif

    /// The public key from Info.plist, or nil while it is unset.
    static var publicKey: String? {
        let value = (Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
        return value
    }

    var isConfigured: Bool {
        #if canImport(Sparkle)
        return Updater.publicKey != nil
        #else
        return false
        #endif
    }

    func start() {
        #if canImport(Sparkle)
        guard Updater.publicKey != nil, controller == nil else { return }
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        #endif
    }

    func checkForUpdates() {
        #if canImport(Sparkle)
        controller?.checkForUpdates(nil)
        #endif
    }
}
