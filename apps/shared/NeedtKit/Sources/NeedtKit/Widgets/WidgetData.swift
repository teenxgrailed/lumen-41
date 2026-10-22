import Foundation

// The data every widget, Control and Live Activity reads. One snapshot is
// fetched from Needt's own API (tasks, events, habits, focus, plan), kept in
// the shared offline cache, and turned into per-widget models by
// `WidgetModels.swift`. Nothing here imports WidgetKit, so it is tested with
// a plain `swift test`.

/// Free keeps three habits (owner decision 2026-10-10); a trial and Lifetime
/// count as Pro.
public enum WidgetPlan: String, Codable, Sendable {
    case free, pro

    public static let freeHabitLimit = 3

    /// `GET /api/billing` answers "FREE", "PRO" or "LIFETIME".
    public init(apiName: String?) {
        self = (apiName?.uppercased() ?? "FREE") == "FREE" ? .free : .pro
    }
}

/// A calendar event, only what a widget draws.
public struct WidgetEvent: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let end: Date
    public let allDay: Bool
    public let location: String?
    /// "#rrggbb" of the calendar the event is on.
    public let colorHex: String?

    public init(id: String, title: String, start: Date, end: Date, allDay: Bool = false,
                location: String? = nil, colorHex: String? = nil) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.allDay = allDay
        self.location = location
        self.colorHex = colorHex
    }

    public func overlaps(_ other: WidgetEvent) -> Bool {
        id != other.id && start < other.end && other.start < end
    }
}

/// A habit with today's check-in and its streak.
public struct WidgetHabit: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let colorHex: String?
    public var doneToday: Bool
    /// Consecutive days up to and including today (or up to yesterday while
    /// today is still open).
    public let streak: Int
    /// The last 28 days at most, oldest first, today last.
    public let history: [Bool]

    /// The last seven days, oldest first, today last.
    public var last7: [Bool] { Array(history.suffix(7)) }

    public init(id: String, title: String, colorHex: String? = nil, doneToday: Bool,
                streak: Int = 0, history: [Bool] = []) {
        self.id = id
        self.title = title
        self.colorHex = colorHex
        self.doneToday = doneToday
        self.streak = streak
        self.history = history
    }
}

/// The running (or paused) focus session.
public struct WidgetFocus: Codable, Equatable, Sendable {
    public let sessionId: String
    public let title: String?
    public let taskId: String?
    public let plannedMinutes: Int?
    public let startedAt: Date
    public let pausedAt: Date?
    public let pausedTotalSeconds: Int
    public let isBreak: Bool

    public init(sessionId: String, title: String?, taskId: String?, plannedMinutes: Int?,
                startedAt: Date, pausedAt: Date? = nil, pausedTotalSeconds: Int = 0, isBreak: Bool = false) {
        self.sessionId = sessionId
        self.title = title
        self.taskId = taskId
        self.plannedMinutes = plannedMinutes
        self.startedAt = startedAt
        self.pausedAt = pausedAt
        self.pausedTotalSeconds = pausedTotalSeconds
        self.isBreak = isBreak
    }

    public var isPaused: Bool { pausedAt != nil }

    /// Paused time pushes the whole run later, so the countdown is simply
    /// "effective start ... end" and `pauseTime` freezes it.
    public var effectiveStart: Date { startedAt.addingTimeInterval(TimeInterval(pausedTotalSeconds)) }

    /// When the run ends if it is not paused again; nil for an open-ended run.
    public var endDate: Date? {
        plannedMinutes.map { effectiveStart.addingTimeInterval(TimeInterval($0 * 60)) }
    }

    /// The range `Text(timerInterval:)` and `ProgressView(timerInterval:)` take.
    /// While paused the end moves with the pause: the caller passes `pausedAt`
    /// as `pauseTime`, and the range keeps its original ends.
    public var interval: ClosedRange<Date>? {
        guard let endDate, endDate > effectiveStart else { return nil }
        return effectiveStart...endDate
    }

    /// Whole seconds left at `now` (frozen at the pause while paused), nil
    /// when the run is open-ended.
    public func secondsLeft(at now: Date) -> Int? {
        guard let endDate else { return nil }
        return max(0, Int(endDate.timeIntervalSince(pausedAt ?? now).rounded(.up)))
    }

    /// 0...1 of the planned time that has passed at `now`.
    public func progress(at now: Date) -> Double {
        guard let interval else { return 0 }
        let reference = pausedAt ?? now
        let total = interval.upperBound.timeIntervalSince(interval.lowerBound)
        guard total > 0 else { return 0 }
        return min(1, max(0, reference.timeIntervalSince(interval.lowerBound) / total))
    }

    public func hasEnded(at now: Date) -> Bool {
        guard pausedAt == nil, let endDate else { return false }
        return endDate <= now
    }
}

/// Everything one fetch brings back, in the shape the widgets need.
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public var plan: WidgetPlan
    /// Open tasks that belong to today or are overdue, plus today's done ones.
    public var tasks: [TaskSummary]
    /// Events from yesterday's end to two days ahead.
    public var events: [WidgetEvent]
    public var habits: [WidgetHabit]
    public var focus: WidgetFocus?
    /// When the last focus run ended, for "Done 12 min early".
    public var lastFocusTitle: String?
    public var fetchedAt: Date

    public init(plan: WidgetPlan = .free, tasks: [TaskSummary] = [], events: [WidgetEvent] = [],
                habits: [WidgetHabit] = [], focus: WidgetFocus? = nil, lastFocusTitle: String? = nil,
                fetchedAt: Date) {
        self.plan = plan
        self.tasks = tasks
        self.events = events
        self.habits = habits
        self.focus = focus
        self.lastFocusTitle = lastFocusTitle
        self.fetchedAt = fetchedAt
    }
}

/// Where a model's data came from.
public enum WidgetStatus: Equatable, Sendable {
    /// Fresh from the API.
    case live
    /// The network failed; the last snapshot saved at this time is shown.
    case stale(Date)
    /// Nobody is signed in (no session in the shared vault, or a 401).
    case signedOut
    /// WidgetKit is still loading: static shapes only.
    case placeholder
}

/// Short, plain text for a time of day: "14:05".
public enum WidgetClock {
    public static func hhmm(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    /// "Updated 14:05"
    public static func updated(_ date: Date, calendar: Calendar = .current) -> String {
        "Updated " + hhmm(date, calendar: calendar)
    }
}
