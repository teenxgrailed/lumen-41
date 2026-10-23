import Foundation

/// A value read from disk together with when it was saved.
public struct Cached<Value: Codable & Sendable>: Codable, Sendable {
    public let value: Value
    public let savedAt: Date
    public init(value: Value, savedAt: Date) {
        self.value = value
        self.savedAt = savedAt
    }
}

/// What a read returns: the value, and when it is from if it came from disk
/// because the network failed.
public struct ReadResult<Value: Sendable>: Sendable {
    public let value: Value
    /// nil for a live response; the save time of the cached copy otherwise.
    public let staleSince: Date?
    public var isOffline: Bool { staleSince != nil }
    public init(value: Value, staleSince: Date?) {
        self.value = value
        self.staleSince = staleSince
    }

    /// "Offline · updated 14:05", nil for a live response.
    public func note(calendar: Calendar = .current) -> String? {
        staleSince.map { OfflineCache.note(updatedAt: $0, calendar: calendar) }
    }
}

/// The last successful responses on disk, one JSON file per key. Read-only
/// fallback for when the network fails; there is no edit queue.
public final class OfflineCache: @unchecked Sendable {
    public enum Key: String, Sendable, CaseIterable {
        case tray, today, tasks
        /// The widgets' one combined snapshot (`WidgetSnapshot`).
        case widget
    }

    private let directory: URL
    private let fileManager: FileManager
    private let lock = NSLock()

    public init(directory: URL, fileManager: FileManager = .default) {
        self.directory = directory
        self.fileManager = fileManager
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// The cache in the shared App Group container.
    public static let shared = OfflineCache(
        directory: SharedContainer.directory().appendingPathComponent("cache", isDirectory: true)
    )

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        return e
    }()
    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return d
    }()

    private func url(_ key: Key) -> URL { directory.appendingPathComponent("\(key.rawValue).json") }

    public func save<Value: Codable & Sendable>(_ value: Value, for key: Key, at date: Date = Date()) {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Self.encoder.encode(Cached(value: value, savedAt: date)) else { return }
        try? data.write(to: url(key), options: .atomic)
    }

    public func load<Value: Codable & Sendable>(_ type: Value.Type, for key: Key) -> Cached<Value>? {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Data(contentsOf: url(key)) else { return nil }
        return try? Self.decoder.decode(Cached<Value>.self, from: data)
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        for key in Key.allCases { try? fileManager.removeItem(at: url(key)) }
    }

    public static func note(updatedAt: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: updatedAt)
        return String(format: "Offline · updated %02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// The reason shown beside a disabled write action.
    public static let writeDisabledReason = "You are offline. Needt shows your last data; changes need a connection."
}
