import Foundation

// The island's settings and the pure rules behind its states.
//
// The settings live on the server in `UserSettings.prefs.island` (one JSON
// object) so the web app's Settings, Desktop, Island section and the Mac app
// read and write the same thing. This file is the contract: the keys below are
// the ones the web side stores. Every key is optional on the wire; a missing,
// misspelt or wrongly typed key is its default, so an older or newer page can
// never break the island.
//
//   prefs.island = {
//     "show": true,                        // the master switch (Pro)
//     "tabs": { "today": true, "week": true, "focus": true },
//     "modules": [ { "id": "music", "on": true }, ... ],   // order = order in the grid
//     "peek": true,                        // hover shows the peek
//     "hoverDelay": 0.26,                  // seconds before the peek
//     "openOn": "click" | "hover",         // "hover" = long hover opens
//     "showNothingOnPlan": true,           // dark cockpit
//     "quiet": false,                      // no moments at all
//     "haptics": true,
//     "moments": { "music": true, "airpods": true, "charging": true, "volume": true },
//     "warnMinutes": 5,
//     "standbySeconds": 30,
//     "quietDuringStandby": true,
//     "hud": true                          // scroll = volume (direct build only)
//   }

public enum IslandModuleID: String, CaseIterable, Codable, Sendable {
    case music, cal, shelf, clip, dev, tools, hud
}

public struct IslandPrefs: Equatable, Sendable {
    public struct Tabs: Equatable, Sendable {
        public var today = true
        public var week = true
        public var focus = true
        public init() {}
    }

    public struct Moments: Equatable, Sendable {
        public var music = true
        public var airpods = true
        public var charging = true
        public var volume = true
        public init() {}
    }

    public struct ModuleSetting: Equatable, Sendable {
        public var id: IslandModuleID
        public var on: Bool
        public init(id: IslandModuleID, on: Bool = true) {
            self.id = id
            self.on = on
        }
    }

    public enum OpenOn: String, Sendable { case click, hover }

    public var show = true
    public var tabs = Tabs()
    public var modules: [ModuleSetting] = IslandModuleID.allCases.map { ModuleSetting(id: $0) }
    public var peek = true
    /// Seconds before the peek; nil means "use the Mac's own setting".
    public var hoverDelay: Double?
    public var openOn = OpenOn.click
    public var showNothingOnPlan = true
    public var quiet = false
    public var haptics = true
    public var moments = Moments()
    public var warnMinutes = 5
    public var standbySeconds = 30
    public var quietDuringStandby = true
    public var hud = true

    public init() {}

    public static let defaults = IslandPrefs()

    /// The modules the grid shows: switched on, in the stored order.
    public var visibleModules: [IslandModuleID] {
        modules.filter(\.on).map(\.id)
    }

    /// The tabs the bar shows, in bar order.
    public enum Tab: String, CaseIterable, Sendable { case today, week, focus }

    public var visibleTabs: [Tab] {
        var out: [Tab] = []
        if tabs.today { out.append(.today) }
        if tabs.week { out.append(.week) }
        if tabs.focus { out.append(.focus) }
        // The bar is never empty: Today is the floor.
        return out.isEmpty ? [.today] : out
    }

    /// Reads `prefs.island` out of a `GET /api/user-settings` body.
    public static func decode(settingsJSON data: Data) -> IslandPrefs {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let prefs = root["prefs"] as? [String: Any],
              let island = prefs["island"] as? [String: Any]
        else { return IslandPrefs() }
        return decode(island: island)
    }

    public static func decode(island o: [String: Any]) -> IslandPrefs {
        var p = IslandPrefs()
        func bool(_ any: Any?) -> Bool? { any as? Bool }
        func number(_ any: Any?) -> Double? {
            if let n = any as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.doubleValue }
            return nil
        }
        if let v = bool(o["show"]) { p.show = v }
        if let t = o["tabs"] as? [String: Any] {
            if let v = bool(t["today"]) { p.tabs.today = v }
            if let v = bool(t["week"]) { p.tabs.week = v }
            if let v = bool(t["focus"]) { p.tabs.focus = v }
        }
        if let list = o["modules"] as? [[String: Any]] {
            var seen = Set<IslandModuleID>()
            var out: [ModuleSetting] = []
            for item in list {
                guard let raw = item["id"] as? String, let id = IslandModuleID(rawValue: raw),
                      !seen.contains(id) else { continue }
                seen.insert(id)
                out.append(ModuleSetting(id: id, on: bool(item["on"]) ?? true))
            }
            // Modules the page did not mention keep their place at the end.
            for id in IslandModuleID.allCases where !seen.contains(id) {
                out.append(ModuleSetting(id: id, on: true))
            }
            p.modules = out
        }
        if let v = bool(o["peek"]) { p.peek = v }
        if let v = number(o["hoverDelay"]) { p.hoverDelay = min(max(v, 0), 2) }
        if let raw = o["openOn"] as? String, let v = OpenOn(rawValue: raw) { p.openOn = v }
        if let v = bool(o["showNothingOnPlan"]) { p.showNothingOnPlan = v }
        if let v = bool(o["quiet"]) { p.quiet = v }
        if let v = bool(o["haptics"]) { p.haptics = v }
        if let m = o["moments"] as? [String: Any] {
            if let v = bool(m["music"]) { p.moments.music = v }
            if let v = bool(m["airpods"]) { p.moments.airpods = v }
            if let v = bool(m["charging"]) { p.moments.charging = v }
            if let v = bool(m["volume"]) { p.moments.volume = v }
        }
        if let v = number(o["warnMinutes"]) { p.warnMinutes = min(max(Int(v), 1), 30) }
        if let v = number(o["standbySeconds"]) { p.standbySeconds = min(max(Int(v), 5), 120) }
        if let v = bool(o["quietDuringStandby"]) { p.quietDuringStandby = v }
        if let v = bool(o["hud"]) { p.hud = v }
        return p
    }
}

// MARK: - Calls before the next block

public enum IslandCall: Equatable, Sendable {
    case none
    /// "Next 15:00 · task" slides in; the ring pulses twice.
    case warning
    /// The island grows and offers Skip / Go.
    case standby
}

public enum IslandCadence {
    /// Which call the island makes `secondsLeft` before the running block ends.
    /// Both calls announce the next block, so with nothing next there is none.
    public static func call(secondsLeft: Int, hasNext: Bool, warnMinutes: Int, standbySeconds: Int) -> IslandCall {
        guard hasNext, secondsLeft > 0 else { return .none }
        if secondsLeft <= standbySeconds { return .standby }
        if secondsLeft <= warnMinutes * 60 { return .warning }
        return .none
    }
}

// MARK: - Manual change ("white dot")

public struct IslandOverride: Equatable, Sendable {
    /// One line for the peek: what was changed by hand.
    public var text: String
    /// The tasks whose slot the person pinned; "Hand back to Needt" releases them.
    public var taskIds: [String]
    public var count: Int

    public init(text: String, taskIds: [String], count: Int) {
        self.text = text
        self.taskIds = taskIds
        self.count = count
    }
}

public enum IslandOverrides {
    /// The plan was changed by hand when a focus is paused or a task scheduled
    /// for today or later carries a pinned slot. nil means the day is on plan.
    public static func detect(
        tasks: [TaskSummary], focusPaused: Bool, now: Date = Date(), calendar: Calendar = .current
    ) -> IslandOverride? {
        let startOfDay = calendar.startOfDay(for: now)
        let pinned = tasks
            .filter { !$0.isDone && $0.trashedAt == nil && $0.scheduleLocked == true }
            .filter { ($0.scheduledStart ?? .distantPast) >= startOfDay }
            .sorted { ($0.scheduledStart ?? .distantFuture) < ($1.scheduledStart ?? .distantFuture) }
        if let first = pinned.first {
            let time = Digest.timeLabel(first.scheduledStart, calendar: calendar)
            let title = TrayState.clean(first.title, max: 40)
            let text = time.map { "You moved \(title) to \($0)" } ?? "You pinned \(title)"
            return IslandOverride(text: text, taskIds: pinned.map(\.id), count: pinned.count)
        }
        if focusPaused {
            return IslandOverride(text: "Your focus is paused", taskIds: [], count: 1)
        }
        return nil
    }
}

// MARK: - Week

public struct IslandWeekDay: Equatable, Sendable, Identifiable {
    public var id: Date { date }
    public var date: Date
    public var minutes: Int
    public var isToday: Bool

    public init(date: Date, minutes: Int, isToday: Bool) {
        self.date = date
        self.minutes = minutes
        self.isToday = isToday
    }

    /// 0...1 against an 8 h day.
    public var load: Double { min(1, Double(minutes) / 480) }
}

public enum IslandWeek {
    /// Seven days starting on the first weekday of the calendar's week
    /// containing `now`, with the planned minutes per day (open tasks only).
    public static func days(
        _ tasks: [TaskSummary], now: Date = Date(), calendar: Calendar = .current
    ) -> [IslandWeekDay] {
        guard let week = calendar.dateInterval(of: .weekOfYear, for: now) else { return [] }
        return (0..<7).compactMap { offset -> IslandWeekDay? in
            guard let day = calendar.date(byAdding: .day, value: offset, to: week.start),
                  let next = calendar.date(byAdding: .day, value: 1, to: day) else { return nil }
            let minutes = tasks
                .filter { !$0.isDone && $0.trashedAt == nil }
                .filter { task in
                    guard let start = task.scheduledStart else { return false }
                    return start >= day && start < next
                }
                .reduce(0) { sum, task in
                    if let s = task.scheduledStart, let e = task.scheduledEnd, e > s {
                        return sum + Int(e.timeIntervalSince(s) / 60)
                    }
                    return sum + (task.estimatedMinutes ?? 30)
                }
            return IslandWeekDay(date: day, minutes: minutes, isToday: calendar.isDate(day, inSameDayAs: now))
        }
    }

    /// "4 h", "1 h 30", "—" for nothing.
    public static func hoursLabel(_ minutes: Int) -> String {
        guard minutes > 0 else { return "—" }
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) min" }
        return m == 0 ? "\(h) h" : "\(h) h \(m)"
    }
}
