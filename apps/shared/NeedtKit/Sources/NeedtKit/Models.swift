import Foundation

/// One task line in the menu bar: the next tasks of today.
public struct TrayTask: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    /// "HH:mm", nil for a task with no time.
    public let time: String?

    public init(id: String, title: String, time: String?) {
        self.id = id
        self.title = title
        self.time = time
    }
}

/// What the web app reports about the day (`needt-tray-state`, produced by
/// `trayState()` in src/components/needt3/root/desktopTray.ts). Every field is
/// optional on the wire so an older or newer page can never break the menu.
public struct TrayState: Codable, Equatable, Sendable {
    /// Today's open tasks plus the overdue ones.
    public var open: Int
    /// Overdue open tasks: the Dock badge.
    public var overdue: Int
    public var next: [TrayTask]
    /// "Focus 12 min left", "Focus paused"; nil when no focus runs.
    public var focus: String?
    /// Epoch milliseconds when a running, unpaused focus ends.
    public var focusEndsAt: Double?
    public var focusTitle: String?

    public static let maxTasks = 3
    public static let maxTitle = 60

    public static let empty = TrayState(open: 0, overdue: 0, next: [], focus: nil, focusEndsAt: nil, focusTitle: nil)

    public init(open: Int, overdue: Int, next: [TrayTask], focus: String?, focusEndsAt: Double?, focusTitle: String?) {
        self.open = open
        self.overdue = overdue
        self.next = next
        self.focus = focus
        self.focusEndsAt = focusEndsAt
        self.focusTitle = focusTitle
    }

    private enum CodingKeys: String, CodingKey {
        case open, overdue, next, focus, focusEndsAt, focusTitle
    }

    /// Decode-only wire keys: `focusRun` has no stored property, so it cannot
    /// sit in CodingKeys without breaking the synthesized Encodable.
    private enum WireKeys: String, CodingKey {
        case focusRun
    }

    /// The web app's `focusRun` (desktopTray.ts): the running session as data.
    /// Older pages sent `focusEndsAt` and `focusTitle` on their own; both work.
    private struct FocusRun: Decodable {
        var title: String?
        var endsAt: Double?
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        open = max(0, (try? c.decode(Int.self, forKey: .open)) ?? 0)
        overdue = max(0, (try? c.decode(Int.self, forKey: .overdue)) ?? 0)
        next = (try? c.decode([TrayTask].self, forKey: .next)) ?? []
        focus = try? c.decodeIfPresent(String.self, forKey: .focus)
        let w = try decoder.container(keyedBy: WireKeys.self)
        let run = try? w.decodeIfPresent(FocusRun.self, forKey: .focusRun)
        focusEndsAt = (try? c.decodeIfPresent(Double.self, forKey: .focusEndsAt)) ?? run?.endsAt
        focusTitle = (try? c.decodeIfPresent(String.self, forKey: .focusTitle)) ?? run?.title
    }

    /// Parses a payload from the page and cleans it the way the Tauri shell
    /// did: control characters out, bounded lengths, only well-formed ids.
    public static func parse(json: Any) -> TrayState? {
        guard JSONSerialization.isValidJSONObject(json),
              let data = try? JSONSerialization.data(withJSONObject: json),
              let raw = try? JSONDecoder().decode(TrayState.self, from: data)
        else { return nil }
        return raw.sanitized()
    }

    public func sanitized() -> TrayState {
        var copy = self
        copy.next = Array(
            next.filter { TrayState.validID($0.id) }
                .prefix(TrayState.maxTasks)
                .map { task -> TrayTask in
                    let time = task.time.map { TrayState.clean($0, max: 5) }
                    return TrayTask(
                        id: task.id,
                        title: TrayState.clean(task.title, max: TrayState.maxTitle),
                        time: (time?.isEmpty ?? true) ? nil : time
                    )
                }
        )
        let line = focus.map { TrayState.clean($0, max: TrayState.maxTitle) }
        copy.focus = (line?.isEmpty ?? true) ? nil : line
        let title = focusTitle.map { TrayState.clean($0, max: TrayState.maxTitle) }
        copy.focusTitle = (title?.isEmpty ?? true) ? nil : title
        return copy
    }

    /// One line of plain text: no control characters, bounded length.
    public static func clean(_ text: String, max: Int) -> String {
        let kept = text.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }
        var result = ""
        result.unicodeScalars.append(contentsOf: kept.prefix(max))
        return result.trimmingCharacters(in: .whitespaces)
    }

    public static func validID(_ id: String) -> Bool {
        guard !id.isEmpty, id.count <= 64 else { return false }
        return id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }

    /// Seconds left on the focus at `now`, nil when it is not counting down.
    public func focusSecondsLeft(at now: Date = Date()) -> Int? {
        guard let end = focusEndsAt else { return nil }
        let left = Int((end / 1000 - now.timeIntervalSince1970).rounded(.up))
        return left > 0 ? left : nil
    }
}

/// `mm:ss` (or `h:mm:ss` past an hour).
public func formatClock(_ seconds: Int) -> String {
    let s = max(0, seconds)
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0
        ? String(format: "%d:%02d:%02d", h, m, sec)
        : String(format: "%02d:%02d", m, sec)
}

/// The running focus session as `GET /api/focus/session` returns it.
public struct FocusSession: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let taskId: String?
    public let intention: String?
    public let plannedMinutes: Int?
    public let startedAt: Date
    public let pausedAt: Date?
    public let pausedTotalSeconds: Int
    public let phase: String?

    public var isBreak: Bool { phase == "SHORT_BREAK" || phase == "LONG_BREAK" }
    public var isPaused: Bool { pausedAt != nil }

    /// Seconds of focus so far, not counting paused time.
    public func elapsedSeconds(at now: Date = Date()) -> Int {
        let reference = pausedAt ?? now
        return max(0, Int(reference.timeIntervalSince(startedAt)) - pausedTotalSeconds)
    }

    public func secondsLeft(at now: Date = Date()) -> Int? {
        plannedMinutes.map { max(0, $0 * 60 - elapsedSeconds(at: now)) }
    }
}

struct FocusSessionEnvelope: Decodable {
    let active: Bool?
    let session: FocusSession?
}

/// A task as `GET /api/tasks` returns it. Only what a menu or a widget needs;
/// unknown fields are ignored and every field but id and title may be missing.
public struct TaskSummary: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let status: String?
    public let dueDate: Date?
    public let scheduledStart: Date?
    public let scheduledEnd: Date?
    public let estimatedMinutes: Int?
    public let trashedAt: Date?

    public var isDone: Bool { status?.lowercased() == "completed" }

    public init(
        id: String, title: String, status: String? = nil, dueDate: Date? = nil,
        scheduledStart: Date? = nil, scheduledEnd: Date? = nil,
        estimatedMinutes: Int? = nil, trashedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.dueDate = dueDate
        self.scheduledStart = scheduledStart
        self.scheduledEnd = scheduledEnd
        self.estimatedMinutes = estimatedMinutes
        self.trashedAt = trashedAt
    }

    /// When the task wants attention: its scheduled slot, else its due date.
    public var when: Date? { scheduledStart ?? dueDate }
}

/// A project, for the "project" parameter of Add task and the Focus filter.
public struct ProjectSummary: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let status: String?

    public init(id: String, name: String, status: String? = nil) {
        self.id = id
        self.name = name
        self.status = status
    }
}

/// A habit, for the "Log habit" intent.
public struct HabitSummary: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String

    public init(id: String, title: String) {
        self.id = id
        self.title = title
    }
}

struct HabitsEnvelope: Decodable {
    let habits: [HabitSummary]
}
