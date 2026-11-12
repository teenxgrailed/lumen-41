import Foundation

/// The off switch. The whole quit blocker is off until the app writes this
/// marker (after the server flag `habits_quit` is on for the account), so a
/// leftover shield or monitor callback does nothing in an account without it.
public enum QuitFlag {
    public static let key = "habits_quit"

    private static func marker(_ directory: URL) -> URL { directory.appendingPathComponent("quit/enabled") }

    public static func isEnabled(in directory: URL = SharedContainer.directory()) -> Bool {
        FileManager.default.fileExists(atPath: marker(directory).path)
    }

    public static func setEnabled(_ on: Bool, in directory: URL = SharedContainer.directory()) {
        let url = marker(directory)
        if on {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? Data("1".utf8).write(to: url, options: .atomic)
        } else {
            try? FileManager.default.removeItem(at: url)
        }
    }
}

/// Per-habit records in the app group, one small JSON file each. The shield
/// extensions read them; only the app writes them.
public enum QuitStore {
    private static func folder(_ directory: URL) -> URL { directory.appendingPathComponent("quit", isDirectory: true) }

    private static func file(_ habitId: String, _ directory: URL) -> URL? {
        QuitDeepLink.isValid(habitId: habitId) ? folder(directory).appendingPathComponent("\(habitId).json") : nil
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    public static func save(_ record: QuitRecord, in directory: URL = SharedContainer.directory()) {
        guard let url = file(record.habitId, directory) else { return }
        try? FileManager.default.createDirectory(at: folder(directory), withIntermediateDirectories: true)
        if let data = try? encoder.encode(record) { try? data.write(to: url, options: .atomic) }
    }

    public static func load(habitId: String, in directory: URL = SharedContainer.directory()) -> QuitRecord? {
        guard let url = file(habitId, directory), let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(QuitRecord.self, from: data)
    }

    public static func remove(habitId: String, in directory: URL = SharedContainer.directory()) {
        if let url = file(habitId, directory) { try? FileManager.default.removeItem(at: url) }
    }
}

/// The habit whose «Тянет» button was pressed on a shield, left for the app to
/// open when it comes to the front. Read once, like `PendingLink`.
public enum QuitPendingPanic {
    private static func url(_ directory: URL) -> URL { directory.appendingPathComponent("quit/pending-panic.txt") }

    public static func set(habitId: String, in directory: URL = SharedContainer.directory()) {
        guard QuitDeepLink.isValid(habitId: habitId) else { return }
        let target = url(directory)
        try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? Data(habitId.utf8).write(to: target, options: .atomic)
    }

    public static func take(in directory: URL = SharedContainer.directory()) -> String? {
        defer { try? FileManager.default.removeItem(at: url(directory)) }
        guard let data = try? Data(contentsOf: url(directory)),
              let id = String(data: data, encoding: .utf8), QuitDeepLink.isValid(habitId: id)
        else { return nil }
        return id
    }
}
