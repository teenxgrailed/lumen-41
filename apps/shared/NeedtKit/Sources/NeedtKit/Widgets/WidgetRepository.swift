import Foundation

// Reads the existing API routes (`/api/tasks`, `/api/events`, `/api/habits`,
// `/api/habits/history`, `/api/focus/session`, `/api/billing`) and keeps the
// last good answer in the shared offline cache. No new server route.

private struct EventDTO: Decodable {
    struct Feed: Decodable { let name: String?; let color: String? }
    let id: String
    let title: String
    let start: Date
    let end: Date
    let allDay: Bool?
    let location: String?
    let transparent: Bool?
    let selfDeclined: Bool?
    let archivedAt: Date?
    let feed: Feed?

    var widgetEvent: WidgetEvent? {
        if selfDeclined == true || archivedAt != nil { return nil }
        return WidgetEvent(id: id, title: title, start: start, end: end, allDay: allDay ?? false,
                           location: (location?.isEmpty ?? true) ? nil : location, colorHex: feed?.color)
    }
}

private struct HabitDTO: Decodable {
    let id: String
    let title: String
    let color: String?
    let isActive: Bool?
}

private struct HabitListEnvelope: Decodable { let habits: [HabitDTO] }

private struct HabitHistoryEnvelope: Decodable {
    struct Row: Decodable { let id: String; let done: [Int] }
    let habits: [Row]
}

extension NeedtAPI {
    /// Calendar events across the person's enabled feeds.
    func widgetEvents() async throws -> [WidgetEvent] {
        let data = try await request("/api/events")
        return try Self.decoder.decode([EventDTO].self, from: data).compactMap(\.widgetEvent)
    }

    /// Habits with today's check-in and their streaks.
    func widgetHabits() async throws -> [WidgetHabit] {
        let listData = try await request("/api/habits")
        let list = try Self.decoder.decode(HabitListEnvelope.self, from: listData).habits.filter { $0.isActive != false }
        let historyData = try await request("/api/habits/history?days=60")
        let history = try Self.decoder.decode(HabitHistoryEnvelope.self, from: historyData)
        let byId = Dictionary(history.habits.map { ($0.id, $0.done) }, uniquingKeysWith: { a, _ in a })
        return list.map { habit in
            let done = (byId[habit.id] ?? []).map { $0 == 1 }
            return WidgetHabit(
                id: habit.id, title: habit.title, colorHex: habit.color,
                doneToday: done.last ?? false, streak: WidgetRepository.streak(done),
                history: Array(done.suffix(28))
            )
        }
    }

    /// "FREE" / "PRO" / "LIFETIME" from `GET /api/billing`.
    func widgetPlan() async throws -> WidgetPlan {
        let data = try await request("/api/billing")
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NeedtAPIError.badResponse
        }
        return WidgetPlan(apiName: object["plan"] as? String)
    }
}

/// The outcome of one load.
public struct WidgetLoad: Sendable {
    public let snapshot: WidgetSnapshot?
    public let status: WidgetStatus

    public init(snapshot: WidgetSnapshot?, status: WidgetStatus) {
        self.snapshot = snapshot
        self.status = status
    }
}

public enum WidgetEnvironment {
    public static let productionBase = URL(string: "https://use.needt.app")!

    /// `NeedtBaseURL` in Info.plist (debug builds), else production.
    public static var baseURL: URL {
        if let text = Bundle.main.object(forInfoDictionaryKey: "NeedtBaseURL") as? String,
           let url = URL(string: text), url.scheme == "https" || url.host == "localhost" {
            return url
        }
        return productionBase
    }
}

/// Loads a `WidgetSnapshot` for any widget, Control or Live Activity.
public struct WidgetRepository: Sendable {
    private let makeAPI: @Sendable () -> NeedtAPI
    private let vault: CookieVault
    private let cache: OfflineCache

    public init(baseURL: URL = WidgetEnvironment.baseURL, vault: CookieVault = .shared,
                cache: OfflineCache = .shared, session: URLSession = .shared) {
        self.vault = vault
        self.cache = cache
        self.makeAPI = { NeedtAPI(baseURL: baseURL, session: session) { vault.load() } }
    }

    public var isSignedIn: Bool { !vault.load().isEmpty }

    /// The last saved snapshot, whatever its age.
    public func cached() -> Cached<WidgetSnapshot>? { cache.load(WidgetSnapshot.self, for: .widget) }

    public func load(now: Date = Date(), calendar: Calendar = .current) async -> WidgetLoad {
        guard isSignedIn else { return WidgetLoad(snapshot: nil, status: .signedOut) }
        let api = makeAPI()
        let previous = cached()?.value
        do {
            async let tasks = api.tasks()
            async let focus = api.activeFocusSession()
            async let events = try? api.widgetEvents()
            async let habits = try? api.widgetHabits()
            async let plan = try? api.widgetPlan()
            let allTasks = try await tasks
            let session = try await focus
            let snapshot = WidgetSnapshot(
                plan: await plan ?? previous?.plan ?? .free,
                tasks: Self.trim(allTasks, now: now, calendar: calendar),
                events: Self.window(await events ?? previous?.events ?? [], now: now, calendar: calendar),
                habits: await habits ?? previous?.habits ?? [],
                focus: session.map { Self.focus($0, tasks: allTasks) },
                lastFocusTitle: session.map { Self.focus($0, tasks: allTasks).title } ?? previous?.lastFocusTitle ?? nil,
                fetchedAt: now
            )
            cache.save(snapshot, for: .widget, at: now)
            return WidgetLoad(snapshot: snapshot, status: .live)
        } catch NeedtAPIError.notSignedIn {
            return WidgetLoad(snapshot: nil, status: .signedOut)
        } catch {
            // Offline, a 5xx or a bad body: the last good snapshot, marked stale.
            if let hit = cache.load(WidgetSnapshot.self, for: .widget) {
                return WidgetLoad(snapshot: hit.value, status: .stale(hit.savedAt))
            }
            return WidgetLoad(snapshot: nil, status: .stale(now))
        }
    }

    // MARK: local edits after an intent

    /// An intent finished a write: patch the saved snapshot so the reload that
    /// follows shows the change even before the next fetch.
    public func patchCache(now: Date = Date(), _ change: (inout WidgetSnapshot) -> Void) {
        guard var hit = cached()?.value else { return }
        change(&hit)
        cache.save(hit, for: .widget, at: cached()?.savedAt ?? now)
    }

    public func markTask(_ id: String, done: Bool, now: Date = Date()) {
        patchCache(now: now) { snapshot in
            snapshot.tasks = snapshot.tasks.map { t in
                guard t.id == id else { return t }
                return TaskSummary(
                    id: t.id, title: t.title, status: done ? "completed" : "todo", dueDate: t.dueDate,
                    scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd,
                    estimatedMinutes: t.estimatedMinutes, trashedAt: t.trashedAt, projectId: t.projectId,
                    completedAt: done ? now : nil, priority: t.priority, project: t.project
                )
            }
        }
    }

    public func markHabit(_ id: String, done: Bool) {
        patchCache { snapshot in
            snapshot.habits = snapshot.habits.map { h in
                guard h.id == id, h.doneToday != done else { return h }
                var history = h.history
                if !history.isEmpty { history[history.count - 1] = done }
                return WidgetHabit(id: h.id, title: h.title, colorHex: h.colorHex, doneToday: done,
                                   streak: max(0, h.streak + (done ? 1 : -1)), history: history)
            }
        }
    }

    // MARK: pure helpers

    /// Trailing run of days done. While today is still open, yesterday's run
    /// counts, so the number does not drop to 0 each morning.
    public static func streak(_ done: [Bool]) -> Int {
        var days = done
        if days.last == false { days.removeLast() }
        return days.reversed().prefix { $0 }.count
    }

    static func focus(_ s: FocusSession, tasks: [TaskSummary]) -> WidgetFocus {
        let intention = s.intention?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = (intention?.isEmpty ?? true) ? tasks.first { $0.id == s.taskId }?.title : intention
        return WidgetFocus(
            sessionId: s.id, title: title, taskId: s.taskId, plannedMinutes: s.plannedMinutes,
            startedAt: s.startedAt, pausedAt: s.pausedAt, pausedTotalSeconds: s.pausedTotalSeconds, isBreak: s.isBreak
        )
    }

    /// Open tasks for today (and overdue) plus the ones finished today; capped
    /// so the cached file stays small.
    static func trim(_ tasks: [TaskSummary], now: Date, calendar: Calendar) -> [TaskSummary] {
        let start = calendar.startOfDay(for: now)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? now
        let open = Digest.today(tasks, now: now, calendar: calendar)
        let done = tasks.filter {
            $0.isDone && $0.trashedAt == nil && ($0.completedAt.map { $0 >= start && $0 < end } ?? false)
        }
        return Array((open + done).prefix(60))
    }

    static func window(_ events: [WidgetEvent], now: Date, calendar: Calendar) -> [WidgetEvent] {
        let start = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: now)) ?? now
        let end = calendar.date(byAdding: .day, value: 3, to: calendar.startOfDay(for: now)) ?? now
        return events.filter { $0.end > start && $0.start < end }.sorted { $0.start < $1.start }
    }
}
