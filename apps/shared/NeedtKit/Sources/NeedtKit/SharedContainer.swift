import Foundation

/// Where the app and its extensions share files. The group id comes from the
/// `NeedtAppGroup` Info.plist key (`$(TeamIdentifierPrefix)app.needt.mac`, set
/// by the build), so it follows whichever team signs the build. Unsigned or
/// ad-hoc builds have no group container; they fall back to a private
/// directory (the app still works, the Share extension just cannot see it).
public enum SharedContainer {
    public static let fallbackGroupID = "group.app.needt.mac"

    public static var groupID: String {
        let value = (Bundle.main.object(forInfoDictionaryKey: "NeedtAppGroup") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty, !value.hasPrefix("$("), value != "app.needt.mac" else {
            return fallbackGroupID
        }
        return value
    }

    /// The shared directory for Needt's own files, created on demand.
    public static func directory(fileManager: FileManager = .default) -> URL {
        // Only a build signed with a real team has its group; asking for the
        // fallback group from an unsigned build makes macOS hold the first file
        // access behind a consent prompt the person never sees, and the app
        // hangs at launch. Unsigned builds use Application Support.
        let entitled = groupID != fallbackGroupID
        let base = (entitled ? fileManager.containerURL(forSecurityApplicationGroupIdentifier: groupID) : nil)
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("Needt", isDirectory: true)
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Keychain access group (`$(AppIdentifierPrefix)app.needt.mac`), nil when unset.
    public static var keychainGroup: String? {
        let value = (Bundle.main.object(forInfoDictionaryKey: "NeedtKeychainGroup") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty, !value.hasPrefix("$("), value != "app.needt.mac" else { return nil }
        return value
    }
}
