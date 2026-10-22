import Foundation

// Per-widget presentation models. Each is a pure function of a snapshot and a
// date, so a timeline is just the same function evaluated at several dates and
// every state in docs `pack.html` -> States is a case here, testable without
// WidgetKit.

public enum WidgetCalendar {
    public static func formatter(_ format: String, calendar: Calendar) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = calendar.locale ?? .current
        f.timeZone = calendar.timeZone
        f.dateFormat = format
        return f
    }
}

// MARK: Today

public struct TodayRow: Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let time: String?
    public let done: Bool
    public let overdue: Bool
    public let colorHex: String?
    public let minutes: Int?

    public init(id: String, title: String, time: String?, done: Bool, overdue: Bool = false,
                colorHex: String? = nil, minutes: Int? = nil) {
        self.id = id
        self.title = title
        self.time = time
        self.done = done
        self.overdue = overdue
        self.colorHex = colorHex
        self.minutes = minutes
    }
}

/// One line of the Large / Mac XL agenda: tasks and events interleaved with
/// the now marker.
public struct AgendaLine: Equatable, Identifiable, Sendable {
    public enum Kind: Equatable, Sendable { case task, event, now }
    public let id: String
    public let kind: Kind
    public let time: String
    public let title: String
    public let done: Bool
    public let colorHex: String?

    public init(id: String, kind: Kind, time: String, title: String, done: Bool = false, colorHex: String? = nil) {
        self.id = id
        self.kind = kind
        self.time = time
        self.title = title
        self.done = done
        self.colorHex = colorHex
    }
}

public struct TodayModel: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case normal, allDone, nothingPlanned, signedOut, placeholder
    }

    public var state: State
    public var status: WidgetStatus
    public var weekday: String
    public var dateLabel: String
    public var clock: String
    public var rows: [TodayRow]
    public var left: Int
    public var done: Int
    public var overdue: Int
    public var nextEvent: WidgetEvent?
    public var agenda: [AgendaLine]
    /// Open tasks for the Mac XL "Focus next" card.
    public var focusNext: [TodayRow]
    /// Rough free hours between now and 21:00, after events and timed tasks.
    public var freeHours: Int?
    /// A toggle that failed lately ("Could not sync").
    public var toggleFailed: Bool

    public static func placeholder(now: Date, calendar: Calendar = .current) -> TodayModel {
        var m = TodayModel.empty(status: .placeholder, state: .placeholder, now: now, calendar: calendar)
        m.rows = (0..<4).map { TodayRow(id: "ph\($0)", title: "Placeholder task", time: nil, done: false) }
        m.left = 4
        return m
    }

    static func empty(status: WidgetStatus, state: State, now: Date, calendar: Calendar) -> TodayModel {
        TodayModel(
            state: state, status: status,
            weekday: WidgetCalendar.formatter("EEEE", calendar: calendar).string(from: now),
            dateLabel: WidgetCalendar.formatter("d MMM", calendar: calendar).string(from: now),
            clock: WidgetClock.hhmm(now, calendar: calendar),
            rows: [], left: 0, done: 0, overdue: 0, nextEvent: nil, agenda: [], focusNext: [],
            freeHours: nil, toggleFailed: false
        )
    }

    public static func make(snapshot: WidgetSnapshot?, status: WidgetStatus, now: Date,
                            toggleFailed: Bool = false, calendar: Calendar = .current) -> TodayModel {
        if status == .signedOut { return empty(status: status, state: .signedOut, now: now, calendar: calendar) }
        if status == .placeholder { return placeholder(now: now, calendar: calendar) }
        var model = empty(status: status, state: .normal, now: now, calendar: calendar)
        guard let snapshot else { model.state = .nothingPlanned; return model }

        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? now

        func row(_ t: TaskSummary) -> TodayRow {
            TodayRow(
                id: t.id, title: t.title, time: Digest.timeLabel(t.when, calendar: calendar), done: t.isDone,
                overdue: !t.isDone && (t.when.map { $0 < startOfDay } ?? false),
                colorHex: t.project?.color, minutes: t.estimatedMinutes
            )
        }
        let open = Digest.today(snapshot.tasks, now: now, calendar: calendar)
        let doneToday = snapshot.tasks
            .filter { $0.isDone && $0.trashedAt == nil && ($0.completedAt.map { $0 >= startOfDay && $0 < endOfDay } ?? false) }
            .sorted { ($0.when ?? $0.completedAt ?? .distantPast) < ($1.when ?? $1.completedAt ?? .distantPast) }

        let ordered = (open + doneToday).sorted { a, b in
            (a.when ?? a.completedAt ?? .distantFuture) < (b.when ?? b.completedAt ?? .distantFuture)
        }
        model.rows = ordered.map(row)
        model.left = open.count
        model.done = doneToday.count
        model.overdue = open.filter { ($0.when.map { $0 < startOfDay } ?? false) }.count
        model.focusNext = open.prefix(3).map(row)

        let todaysEvents = snapshot.events
            .filter { $0.start < endOfDay && $0.end > startOfDay }
            .sorted { $0.start < $1.start }
        model.nextEvent = todaysEvents.first { !$0.allDay && $0.end > now }

        model.agenda = agenda(tasks: ordered, events: todaysEvents.filter { !$0.allDay }, now: now, calendar: calendar)
        model.freeHours = freeHours(open: open, events: todaysEvents, now: now, calendar: calendar)
        model.toggleFailed = toggleFailed

        if model.rows.isEmpty && model.nextEvent == nil {
            model.state = .nothingPlanned
        } else if model.left == 0 && model.done > 0 {
            model.state = .allDone
        } else if model.left == 0 {
            model.state = .nothingPlanned
        }
        return model
    }

    /// The rows a smaller family shows: the open ones first in time order, with
    /// one finished row above them so progress is visible (as in the design).
    public func visibleRows(_ cap: Int) -> [TodayRow] {
        guard rows.count > cap else { return rows }
        let firstOpen = rows.firstIndex { !$0.done } ?? max(0, rows.count - cap)
        var start = max(0, firstOpen - 1)
        start = min(start, rows.count - cap)
        return Array(rows[start..<(start + cap)])
    }

    /// Where the overdue / left count sits in the header.
    public var metaCount: Int { overdue > 0 ? overdue : left }

    static func agenda(tasks: [TaskSummary], events: [WidgetEvent], now: Date, calendar: Calendar) -> [AgendaLine] {
        struct Item { let at: Date?; let line: AgendaLine }
        var items: [Item] = []
        for t in tasks {
            items.append(Item(at: t.when, line: AgendaLine(
                id: "t-" + t.id, kind: .task, time: Digest.timeLabel(t.when, calendar: calendar) ?? "",
                title: t.title, done: t.isDone, colorHex: t.project?.color
            )))
        }
        for e in events {
            items.append(Item(at: e.start, line: AgendaLine(
                id: "e-" + e.id, kind: .event, time: WidgetClock.hhmm(e.start, calendar: calendar),
                title: e.title, colorHex: e.colorHex
            )))
        }
        let timed = items.filter { $0.at != nil }.sorted { ($0.at ?? .distantPast) < ($1.at ?? .distantPast) }
        let untimed = items.filter { $0.at == nil }
        var out: [AgendaLine] = []
        var placed = false
        let marker = AgendaLine(id: "now", kind: .now, time: WidgetClock.hhmm(now, calendar: calendar), title: "")
        for item in timed {
            if !placed, let at = item.at, at > now { out.append(marker); placed = true }
            out.append(item.line)
        }
        if !placed { out.append(marker) }
        out.append(contentsOf: untimed.map(\.line))
        return out
    }

    static func freeHours(open: [TaskSummary], events: [WidgetEvent], now: Date, calendar: Calendar) -> Int? {
        let startOfDay = calendar.startOfDay(for: now)
        guard let dayEnd = calendar.date(byAdding: .hour, value: 21, to: startOfDay), now < dayEnd else { return nil }
        var busy: TimeInterval = 0
        for e in events where !e.allDay {
            let s = max(e.start, now), f = min(e.end, dayEnd)
            if f > s { busy += f.timeIntervalSince(s) }
        }
        for t in open {
            guard let m = t.estimatedMinutes, let w = t.when, w >= now, w < dayEnd else { continue }
            busy += TimeInterval(m * 60)
        }
        let free = dayEnd.timeIntervalSince(now) - busy
        return max(0, Int((free / 3600).rounded()))
    }
}

// MARK: Next event

public struct NextModel: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        /// More than 15 minutes ahead.
        case upcoming
        /// Starts within 15 minutes: heavier weight, never a colour alone.
        case soon
        case inProgress
        case none
        case allDayOnly
        case signedOut, placeholder
    }

    public var state: State
    public var status: WidgetStatus
    public var event: WidgetEvent?
    /// The one after it.
    public var after: WidgetEvent?
    /// An event that overlaps `event`.
    public var conflict: WidgetEvent?
    /// First timed event tomorrow, shown when nothing is left today.
    public var tomorrow: WidgetEvent?
    public var allDayTitle: String?
    public var clock: String
    /// 0...1 of an event in progress.
    public var progress: Double

    public static func make(snapshot: WidgetSnapshot?, status: WidgetStatus, now: Date,
                            calendar: Calendar = .current) -> NextModel {
        var m = NextModel(state: .none, status: status, event: nil, after: nil, conflict: nil, tomorrow: nil,
                          allDayTitle: nil, clock: WidgetClock.hhmm(now, calendar: calendar), progress: 0)
        if status == .signedOut { m.state = .signedOut; return m }
        if status == .placeholder { m.state = .placeholder; return m }
        guard let snapshot else { return m }

        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? now
        let endOfTomorrow = calendar.date(byAdding: .day, value: 2, to: startOfDay) ?? now
        let timed = snapshot.events.filter { !$0.allDay }.sorted { $0.start < $1.start }
        let live = timed.filter { $0.start <= now && $0.end > now }.first
        let coming = timed.filter { $0.start > now && $0.start < endOfDay }

        if let live {
            m.state = .inProgress
            m.event = live
            m.after = coming.first
            let total = live.end.timeIntervalSince(live.start)
            m.progress = total > 0 ? min(1, max(0, now.timeIntervalSince(live.start) / total)) : 0
        } else if let first = coming.first {
            m.event = first
            m.after = coming.dropFirst().first
            m.state = first.start.timeIntervalSince(now) <= 15 * 60 ? .soon : .upcoming
        } else {
            let allDay = snapshot.events.first { $0.allDay && $0.start < endOfDay && $0.end > startOfDay }
            m.tomorrow = timed.first { $0.start >= endOfDay && $0.start < endOfTomorrow }
            if let allDay, timed.allSatisfy({ $0.start < startOfDay || $0.start >= endOfDay }) {
                m.state = .allDayOnly
                m.allDayTitle = allDay.title
            } else {
                m.state = .none
            }
        }
        if let e = m.event { m.conflict = timed.first { $0.overlaps(e) } }
        return m
    }

    /// Whole minutes until the event starts (rounded up), nil for none.
    public func minutesUntil(now: Date) -> Int? {
        guard let event, event.start > now else { return nil }
        return Int((event.start.timeIntervalSince(now) / 60).rounded(.up))
    }
}

// MARK: Focus

public struct FocusModel: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case idle, running, paused, finished, signedOut, placeholder
    }

    public var state: State
    public var status: WidgetStatus
    public var focus: WidgetFocus?
    /// The title of the task the next run would use (or the last one).
    public var lastTitle: String?
    public var minutes: Int

    public static func make(snapshot: WidgetSnapshot?, status: WidgetStatus, now: Date,
                            minutes: Int = FocusFilterState.defaultMinutes) -> FocusModel {
        var m = FocusModel(state: .idle, status: status, focus: nil, lastTitle: snapshot?.lastFocusTitle, minutes: minutes)
        if status == .signedOut { m.state = .signedOut; return m }
        if status == .placeholder { m.state = .placeholder; return m }
        guard let focus = snapshot?.focus else { return m }
        m.focus = focus
        if focus.isPaused {
            m.state = .paused
        } else if focus.hasEnded(at: now) {
            m.state = .finished
        } else {
            m.state = .running
        }
        return m
    }
}

// MARK: Habits

public struct HabitsModel: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case noneLogged, partial, allDone, noHabits, atRisk, signedOut, placeholder
    }

    public var state: State
    public var status: WidgetStatus
    public var plan: WidgetPlan
    /// What the widget may show: all for Pro, the first three for Free.
    public var habits: [WidgetHabit]
    public var done: Int
    public var total: Int
    /// Habits the plan hides.
    public var hidden: Int
    public var bestStreak: Int
    public var bestStreakTitle: String?

    /// After this hour an open habit with a running streak counts as at risk.
    public static let riskHour = 17

    public static func make(snapshot: WidgetSnapshot?, status: WidgetStatus, now: Date,
                            calendar: Calendar = .current) -> HabitsModel {
        var m = HabitsModel(state: .noHabits, status: status, plan: snapshot?.plan ?? .free, habits: [],
                            done: 0, total: 0, hidden: 0, bestStreak: 0, bestStreakTitle: nil)
        if status == .signedOut { m.state = .signedOut; return m }
        if status == .placeholder { m.state = .placeholder; return m }
        guard let snapshot, !snapshot.habits.isEmpty else { return m }
        let all = snapshot.habits
        let shown = snapshot.plan == .free ? Array(all.prefix(WidgetPlan.freeHabitLimit)) : all
        m.habits = shown
        m.hidden = all.count - shown.count
        m.total = shown.count
        m.done = shown.filter(\.doneToday).count
        if let best = shown.max(by: { $0.streak < $1.streak }), best.streak > 0 {
            m.bestStreak = best.streak
            m.bestStreakTitle = best.title
        }
        let hour = calendar.component(.hour, from: now)
        let risk = hour >= riskHour && shown.contains { !$0.doneToday && $0.streak >= 2 }
        if m.done == m.total {
            m.state = .allDone
        } else if risk {
            m.state = .atRisk
        } else if m.done > 0 {
            m.state = .partial
        } else {
            m.state = .noneLogged
        }
        return m
    }

    /// The open habit whose streak is most worth saving.
    public var riskHabit: WidgetHabit? {
        habits.filter { !$0.doneToday && $0.streak >= 2 }.max { $0.streak < $1.streak }
    }
}

// MARK: Quick add

public struct QuickAddModel: Equatable, Sendable {
    public enum State: Equatable, Sendable { case ready, signedOut, offline }
    public var state: State

    public static func make(status: WidgetStatus) -> QuickAddModel {
        switch status {
        case .signedOut: return QuickAddModel(state: .signedOut)
        case .stale: return QuickAddModel(state: .offline)
        case .live, .placeholder: return QuickAddModel(state: .ready)
        }
    }
}
