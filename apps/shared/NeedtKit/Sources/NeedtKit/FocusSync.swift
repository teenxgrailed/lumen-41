import Foundation

/// What a macOS Focus filter asks Needt to do while that Focus is on.
public enum FocusFilterMode: String, Codable, CaseIterable, Sendable {
    /// Nothing (also what the system sends when the Focus turns off).
    case off
    /// Put the next task of the chosen project in the menu as "Start focus".
    case suggest
    /// Start a focus run on that task straight away.
    case start
}

/// The state a Focus filter leaves for the app to act on.
public struct FocusFilterState: Codable, Equatable, Sendable {
    public var mode: FocusFilterMode
    public var projectId: String?
    public var projectName: String?
    public var minutes: Int
    public var updatedAt: Date

    public static let defaultMinutes = 25

    public init(mode: FocusFilterMode = .off, projectId: String? = nil, projectName: String? = nil,
                minutes: Int = FocusFilterState.defaultMinutes, updatedAt: Date = Date()) {
        self.mode = mode
        self.projectId = projectId
        self.projectName = projectName
        self.minutes = min(max(minutes, 1), 240)
        self.updatedAt = updatedAt
    }

    public static let off = FocusFilterState(mode: .off, updatedAt: .distantPast)

    /// The task a filter points at: the next open task of its project (or of
    /// everything when no project is chosen), in `Digest.next` order, else the
    /// first open one.
    public func pickTask(from tasks: [TaskSummary], now: Date = Date()) -> TaskSummary? {
        let pool = projectId == nil ? tasks : tasks.filter { $0.projectId == projectId }
        return Digest.next(pool, now: now)
            ?? pool.first { !$0.isDone && $0.trashedAt == nil }
    }
}

/// A small JSON file in the shared container.
public struct FocusFilterStore: Sendable {
    private let url: URL

    public init(url: URL) { self.url = url }

    public static var shared: FocusFilterStore {
        FocusFilterStore(url: SharedContainer.directory().appendingPathComponent("focus-filter.json"))
    }

    public func load() -> FocusFilterState {
        guard let data = try? Data(contentsOf: url),
              let state = try? JSONDecoder().decode(FocusFilterState.self, from: data)
        else { return .off }
        return state
    }

    public func save(_ state: FocusFilterState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// Pure rules for the menu-bar title and the Focus-to-Shortcut hand-off.
public enum FocusSync {
    /// A title cut to `max` characters with an ellipsis; nil when blank.
    public static func shortTitle(_ title: String?, max: Int = 24) -> String? {
        guard let title else { return nil }
        let clean = TrayState.clean(title, max: 200)
        guard !clean.isEmpty else { return nil }
        guard clean.count > max else { return clean }
        return String(clean.prefix(max - 1)) + "…"
    }

    public enum Transition: Equatable, Sendable { case started, ended, none }

    /// A focus run begins or ends between two tray reports. `previous` nil
    /// means no report was seen yet: that is never a transition (the app may
    /// have been opened in the middle of a run).
    public static func transition(previous: Bool?, current: Bool) -> Transition {
        guard let previous else { return .none }
        if !previous && current { return .started }
        if previous && !current { return .ended }
        return .none
    }

    /// `shortcuts://run-shortcut?name=...` for a user-chosen Shortcut; nil for a blank name.
    public static func shortcutURL(name: String) -> URL? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 200 else { return nil }
        var c = URLComponents()
        c.scheme = "shortcuts"
        c.host = "run-shortcut"
        c.queryItems = [URLQueryItem(name: "name", value: trimmed)]
        return c.url
    }
}
