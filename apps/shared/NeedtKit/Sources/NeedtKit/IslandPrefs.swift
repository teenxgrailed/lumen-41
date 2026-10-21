import Foundation

// The island's settings and the pure rules behind its states.
//
// The settings live on the server in `UserSettings.prefs` as FLAT keys, written
// by the web app's Settings, Desktop (docs/handoff/desktop-prefs.md) and read
// here through `GET /api/user-settings`. This file is the contract: the key
// names, values and defaults below are the ones the web side stores. Every key
// is optional on the wire; a missing, misspelt or wrongly typed key is its
// default, so an older or newer page can never break the island.
//
//   islandShow                     bool            true   (Pro)
//   islandToday/Week/Focus         bool            true   tabs
//   islandMusic/Calendar/Shelf/Devices   bool      true   modules
//   islandClipboard/Tools/Hud      bool            false  modules
//   islandModuleOrder              "music,calendar,shelf,clipboard,devices,tools,hud"
//   islandMomentNow/Airpods/Charging/Done   bool   true
//   islandWarning                  off|2|5|10      5      minutes before the block ends
//   islandStandby                  off|15|30|60    30     seconds before the block ends
//   islandQuietStandby             bool            true
//   islandOnPlanQuiet              bool            true   dark cockpit
//   islandPeek                     hover|off       hover
//   islandHoverDelay               0.1|0.3|0.6|1   0.3    seconds
//   islandOpenOn                   click|hover     click
//   islandDisplays                 built-in|all|main  built-in
//   islandPill/HideFullScreen/Haptics  bool        true
//   islandSounds                   bool            false

public enum IslandModuleID: String, CaseIterable, Codable, Sendable {
    case music, cal, shelf, clip, dev, tools, hud

    /// The id the web side uses in `islandModuleOrder`.
    public var webID: String {
        switch self {
        case .music: return "music"
        case .cal: return "calendar"
        case .shelf: return "shelf"
        case .clip: return "clipboard"
        case .dev: return "devices"
        case .tools: return "tools"
        case .hud: return "hud"
        }
    }

    /// The boolean key that switches the module on.
    public var prefKey: String {
        switch self {
        case .music: return "islandMusic"
        case .cal: return "islandCalendar"
        case .shelf: return "islandShelf"
        case .clip: return "islandClipboard"
        case .dev: return "islandDevices"
        case .tools: return "islandTools"
        case .hud: return "islandHud"
        }
    }

    /// Clipboard, Tools and Hud are off until the person turns them on.
    public var onByDefault: Bool {
        switch self {
        case .clip, .tools, .hud: return false
        default: return true
        }
    }

    init?(webID: String) {
        guard let id = IslandModuleID.allCases.first(where: { $0.webID == webID }) else { return nil }
        self = id
    }
}

public struct IslandPrefs: Equatable, Sendable {
    public struct Tabs: Equatable, Sendable {
        public var today = true
        public var week = true
        public var focus = true
        public init() {}
    }

    public struct Moments: Equatable, Sendable {
        /// Now playing.
        public var now = true
        public var airpods = true
        public var charging = true
        /// A block was finished.
        public var done = true
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

    public enum Displays: String, Sendable {
        case builtIn = "built-in"
        case all
        case main
    }

    public var show = true
    public var tabs = Tabs()
    public var modules: [ModuleSetting] = IslandModuleID.allCases.map { ModuleSetting(id: $0, on: $0.onByDefault) }
    public var peek = true
    /// Seconds before the peek.
    public var hoverDelay: Double = 0.3
    public var openOn = OpenOn.click
    /// Dark cockpit: show nothing while the day is on plan.
    public var showNothingOnPlan = true
    public var haptics = true
    public var sounds = false
    public var pill = true
    public var hideFullScreen = true
    public var displays = Displays.builtIn
    public var moments = Moments()
    /// Minutes before the block ends; 0 is off.
    public var warnMinutes = 5
    /// Seconds before the block ends; 0 is off.
    public var standbySeconds = 30
    public var quietDuringStandby = true

    public init() {}

    public static let defaults = IslandPrefs()

    /// Scroll = volume belongs to the Hud module.
    public var hud: Bool {
        modules.first { $0.id == .hud }?.on ?? false
    }

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

    /// Reads the flat `island*` keys out of a `GET /api/user-settings` body.
    public static func decode(settingsJSON data: Data) -> IslandPrefs {
        guard let prefs = PrefsReader.prefs(from: data) else { return IslandPrefs() }
        return decode(prefs: prefs)
    }

    public static func decode(prefs o: [String: Any]) -> IslandPrefs {
        var p = IslandPrefs()
        let r = PrefsReader(o)
        if let v = r.bool("islandShow") { p.show = v }
        if let v = r.bool("islandToday") { p.tabs.today = v }
        if let v = r.bool("islandWeek") { p.tabs.week = v }
        if let v = r.bool("islandFocus") { p.tabs.focus = v }

        var on: [IslandModuleID: Bool] = [:]
        for id in IslandModuleID.allCases { on[id] = r.bool(id.prefKey) ?? id.onByDefault }
        var order: [IslandModuleID] = []
        if let list = r.string("islandModuleOrder") {
            for part in list.split(separator: ",") {
                let key = part.trimmingCharacters(in: .whitespaces)
                if let id = IslandModuleID(webID: key), !order.contains(id) { order.append(id) }
            }
        }
        // Modules the list did not mention keep their place at the end.
        for id in IslandModuleID.allCases where !order.contains(id) { order.append(id) }
        p.modules = order.map { ModuleSetting(id: $0, on: on[$0] ?? $0.onByDefault) }

        if let v = r.bool("islandMomentNow") { p.moments.now = v }
        if let v = r.bool("islandMomentAirpods") { p.moments.airpods = v }
        if let v = r.bool("islandMomentCharging") { p.moments.charging = v }
        if let v = r.bool("islandMomentDone") { p.moments.done = v }

        if let v = r.string("islandWarning") {
            if v == "off" { p.warnMinutes = 0 } else if let n = Int(v), [2, 5, 10].contains(n) { p.warnMinutes = n }
        }
        if let v = r.string("islandStandby") {
            if v == "off" { p.standbySeconds = 0 } else if let n = Int(v), [15, 30, 60].contains(n) { p.standbySeconds = n }
        }
        if let v = r.bool("islandQuietStandby") { p.quietDuringStandby = v }
        if let v = r.bool("islandOnPlanQuiet") { p.showNothingOnPlan = v }
        if let v = r.string("islandPeek") { p.peek = v != "off" }
        if let v = r.number("islandHoverDelay") { p.hoverDelay = min(max(v, 0), 2) }
        if let v = r.string("islandOpenOn"), let open = OpenOn(rawValue: v) { p.openOn = open }
        if let v = r.string("islandDisplays"), let d = Displays(rawValue: v) { p.displays = d }
        if let v = r.bool("islandPill") { p.pill = v }
        if let v = r.bool("islandHideFullScreen") { p.hideFullScreen = v }
        if let v = r.bool("islandHaptics") { p.haptics = v }
        if let v = r.bool("islandSounds") { p.sounds = v }
        return p
    }
}

/// The Mac app's own keys in the same flat `prefs` map (Settings, Desktop).
public struct DesktopPrefs: Equatable, Sendable {
    public enum DockBadge: String, Sendable { case overdue, off }
    public enum MenuIcon: String, Sendable { case focus, always, off }
    public enum FocusMode: String, Sendable { case off, dnd, work, personal }
    public enum WidgetHabits: String, Sendable { case three = "3", five = "5", all }

    public var dockBadge = DockBadge.overdue
    public var menuIcon = MenuIcon.focus
    /// Modifiers then key, space-separated.
    public var quickAddKeys = "\u{2325} Space"
    public var focusMode = FocusMode.dnd
    public var menuTimer = true
    /// `A`...`H`.
    public var widgetStyle = "D"
    public var widgetTitlesLocked = false
    public var widgetHabits = WidgetHabits.all

    public init() {}

    public static func decode(settingsJSON data: Data) -> DesktopPrefs {
        guard let prefs = PrefsReader.prefs(from: data) else { return DesktopPrefs() }
        return decode(prefs: prefs)
    }

    public static func decode(prefs o: [String: Any]) -> DesktopPrefs {
        var p = DesktopPrefs()
        let r = PrefsReader(o)
        if let v = r.string("macDockBadge"), let e = DockBadge(rawValue: v) { p.dockBadge = e }
        if let v = r.string("macMenuIcon"), let e = MenuIcon(rawValue: v) { p.menuIcon = e }
        if let v = r.string("macQuickAddKeys"), !v.isEmpty { p.quickAddKeys = v }
        if let v = r.string("macFocusMode"), let e = FocusMode(rawValue: v) { p.focusMode = e }
        if let v = r.bool("macMenuTimer") { p.menuTimer = v }
        if let v = r.string("widgetStyle"), ["A", "B", "C", "D", "E", "F", "G", "H"].contains(v) { p.widgetStyle = v }
        if let v = r.bool("widgetTitlesLocked") { p.widgetTitlesLocked = v }
        if let v = r.string("widgetHabits"), let e = WidgetHabits(rawValue: v) { p.widgetHabits = e }
        return p
    }
}

/// Typed reads from the flat prefs map; a wrong type is "not there".
struct PrefsReader {
    let o: [String: Any]
    init(_ o: [String: Any]) { self.o = o }

    static func prefs(from data: Data) -> [String: Any]? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let prefs = root["prefs"] as? [String: Any] else { return nil }
        return prefs
    }

    func bool(_ key: String) -> Bool? { o[key] as? Bool }

    func number(_ key: String) -> Double? {
        if let n = o[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.doubleValue }
        if let s = o[key] as? String { return Double(s) }
        return nil
    }

    /// A string, or a number written in its shortest form ("5", "0.3").
    func string(_ key: String) -> String? {
        if let s = o[key] as? String { return s }
        if let n = o[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() {
            let d = n.doubleValue
            return d == d.rounded() ? String(Int(d)) : String(d)
        }
        return nil
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
