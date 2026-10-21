import Testing
import Foundation
@testable import NeedtKit

@Suite struct WidgetModelsTests {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        c.locale = Locale(identifier: "en_US")
        return c
    }

    /// Tue 27 Oct 2026, 14:20 UTC: the day the design uses everywhere.
    private var now: Date { at(14, 20) }

    private func at(_ h: Int, _ m: Int, day: Int = 27) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m))!
    }

    private func task(_ id: String, _ title: String, _ h: Int?, _ m: Int = 0, done: Bool = false, minutes: Int? = nil, day: Int = 27) -> TaskSummary {
        TaskSummary(
            id: id, title: title, status: done ? "completed" : "todo", dueDate: nil,
            scheduledStart: h.map { at($0, m, day: day) }, estimatedMinutes: minutes,
            completedAt: done ? at(10, 0) : nil
        )
    }

    private func snapshot(tasks: [TaskSummary] = [], events: [WidgetEvent] = [], habits: [WidgetHabit] = [],
                          focus: WidgetFocus? = nil, plan: WidgetPlan = .pro) -> WidgetSnapshot {
        WidgetSnapshot(plan: plan, tasks: tasks, events: events, habits: habits, focus: focus, fetchedAt: now)
    }

    private var week: [TaskSummary] {
        [task("1", "Reply to emails", 9, 30, done: true), task("2", "Review the lecture", 11, 0, done: true),
         task("3", "Write the weekly report", 15, 0), task("4", "Call mom", 16, 30), task("5", "Gym", 18, 0), task("6", "Duolingo", 21, 0)]
    }

    // MARK: Today

    @Test func todayCountsAndOrder() {
        let m = TodayModel.make(snapshot: snapshot(tasks: week), status: .live, now: now, calendar: cal)
        #expect(m.state == .normal)
        #expect(m.left == 4)
        #expect(m.done == 2)
        #expect(m.weekday == "Tuesday")
        #expect(m.dateLabel == "27 Oct")
        #expect(m.clock == "14:20")
        #expect(m.rows.map(\.id) == ["1", "2", "3", "4", "5", "6"])
        #expect(m.rows.first?.time == "09:30")
    }

    @Test func visibleRowsKeepOneFinishedRowAboveTheOpenOnes() {
        let m = TodayModel.make(snapshot: snapshot(tasks: week), status: .live, now: now, calendar: cal)
        #expect(m.visibleRows(4).map(\.id) == ["2", "3", "4", "5"])
        #expect(m.visibleRows(10).count == 6)
        #expect(m.visibleRows(3).map(\.id) == ["2", "3", "4"])
    }

    @Test func allDoneAndNothingPlanned() {
        let doneOnly = TodayModel.make(snapshot: snapshot(tasks: [week[0], week[1]]), status: .live, now: now, calendar: cal)
        #expect(doneOnly.state == .allDone)
        let empty = TodayModel.make(snapshot: snapshot(), status: .live, now: now, calendar: cal)
        #expect(empty.state == .nothingPlanned)
    }

    @Test func overdueCountsOpenTasksFromEarlierDays() {
        let old = task("9", "Send invoices", 9, 0, day: 25)
        let m = TodayModel.make(snapshot: snapshot(tasks: [old, week[2]]), status: .live, now: now, calendar: cal)
        #expect(m.overdue == 1)
        #expect(m.metaCount == 1)
        #expect(m.rows[0].overdue)
        #expect(!(m.rows[1].overdue))
    }

    @Test func signedOutAndPlaceholderShowNoData() {
        let out = TodayModel.make(snapshot: snapshot(tasks: week), status: .signedOut, now: now, calendar: cal)
        #expect(out.state == .signedOut)
        #expect(out.rows.isEmpty)
        let ph = TodayModel.make(snapshot: snapshot(tasks: week), status: .placeholder, now: now, calendar: cal)
        #expect(ph.state == .placeholder)
        #expect(!(ph.rows.contains { $0.title == "Reply to emails" }))
    }

    @Test func staleKeepsDataAndCarriesTheTime() {
        let saved = at(14, 5)
        let m = TodayModel.make(snapshot: snapshot(tasks: week), status: .stale(saved), now: now, calendar: cal)
        #expect(m.status == .stale(saved))
        #expect(m.left == 4)
        #expect(WidgetClock.updated(saved, calendar: cal) == "Updated 14:05")
    }

    @Test func agendaInterleavesEventsAndPutsNowMarkerBeforeTheFirstFutureItem() {
        let call = WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0))
        let m = TodayModel.make(snapshot: snapshot(tasks: week, events: [call]), status: .live, now: now, calendar: cal)
        let ids = m.agenda.map(\.id)
        #expect(ids.firstIndex(of: "now") == ids.firstIndex(of: "t-1")! + 2)
        #expect(m.agenda.first { $0.id == "e-e1" }?.kind == .event)
        #expect(m.nextEvent?.id == "e1")
    }

    @Test func freeHoursSubtractsEventsAndTimedTasks() {
        let call = WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0))
        let m = TodayModel.make(snapshot: snapshot(tasks: [task("3", "Report", 17, 0, minutes: 60)], events: [call]),
                                status: .live, now: now, calendar: cal)
        // 14:20 to 21:00 is 6 h 40 min, minus 1 h call and 1 h task = 4 h 40 min.
        #expect(m.freeHours == 5)
    }

    // MARK: Next event

    @Test func nextStates() {
        let call = WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0), location: "Zoom")
        let padel = WidgetEvent(id: "e2", title: "Padel", start: at(17, 30), end: at(18, 30))
        let up = NextModel.make(snapshot: snapshot(events: [padel, call]), status: .live, now: now, calendar: cal)
        #expect(up.state == .upcoming)
        #expect(up.event?.id == "e1")
        #expect(up.after?.id == "e2")
        #expect(up.minutesUntil(now: now) == 40)

        let soon = NextModel.make(snapshot: snapshot(events: [call]), status: .live, now: at(14, 52), calendar: cal)
        #expect(soon.state == .soon)

        let live = NextModel.make(snapshot: snapshot(events: [call]), status: .live, now: at(15, 21), calendar: cal)
        #expect(live.state == .inProgress)
        #expect(abs((live.progress) - (21.0 / 60.0)) < 0.001)

        let none = NextModel.make(snapshot: snapshot(events: [call]), status: .live, now: at(16, 30), calendar: cal)
        #expect(none.state == .none)
    }

    @Test func nextConflictAllDayAndTomorrow() {
        let call = WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0))
        let review = WidgetEvent(id: "e3", title: "Design review", start: at(15, 30), end: at(16, 30))
        let clash = NextModel.make(snapshot: snapshot(events: [call, review]), status: .live, now: now, calendar: cal)
        #expect(clash.conflict?.id == "e3")

        let week = WidgetEvent(id: "e4", title: "Dentist week", start: at(0, 0), end: at(0, 0, day: 28), allDay: true)
        let stand = WidgetEvent(id: "e5", title: "Standup", start: at(9, 0, day: 28), end: at(9, 15, day: 28))
        let only = NextModel.make(snapshot: snapshot(events: [week, stand]), status: .live, now: now, calendar: cal)
        #expect(only.state == .allDayOnly)
        #expect(only.allDayTitle == "Dentist week")
        #expect(only.tomorrow?.id == "e5")
    }

    // MARK: Focus

    @Test func focusStates() {
        let running = WidgetFocus(sessionId: "s", title: "Deep work", taskId: nil, plannedMinutes: 25, startedAt: at(14, 6))
        #expect(FocusModel.make(snapshot: snapshot(focus: running), status: .live, now: now).state == .running)
        #expect(running.secondsLeft(at: now) == 11 * 60)
        #expect(abs((running.progress(at: now)) - (14.0 / 25.0)) < 0.001)

        let paused = WidgetFocus(sessionId: "s", title: "Deep work", taskId: nil, plannedMinutes: 25,
                                 startedAt: at(14, 6), pausedAt: at(14, 16))
        let pm = FocusModel.make(snapshot: snapshot(focus: paused), status: .live, now: now)
        #expect(pm.state == .paused)
        // Frozen at the pause: 15 of 25 minutes left, however late it is now.
        #expect(paused.secondsLeft(at: at(20, 0)) == 15 * 60)

        let over = WidgetFocus(sessionId: "s", title: "x", taskId: nil, plannedMinutes: 25, startedAt: at(13, 0))
        #expect(FocusModel.make(snapshot: snapshot(focus: over), status: .live, now: now).state == .finished)
        #expect(FocusModel.make(snapshot: snapshot(), status: .live, now: now).state == .idle)
    }

    @Test func pausedTimeMovesTheEnd() {
        let f = WidgetFocus(sessionId: "s", title: nil, taskId: nil, plannedMinutes: 25, startedAt: at(14, 0), pausedTotalSeconds: 300)
        #expect(f.endDate == at(14, 30))
        #expect(f.interval?.lowerBound == at(14, 5))
    }

    // MARK: Habits

    private func habit(_ t: String, _ done: Bool, _ streak: Int) -> WidgetHabit {
        WidgetHabit(id: t, title: t, doneToday: done, streak: streak, history: [true, true, false, true, true, true, done])
    }

    @Test func habitStatesAndFreeLimit() {
        let three = [habit("Duolingo", true, 23), habit("Gym", false, 0), habit("Read", true, 9)]
        let partial = HabitsModel.make(snapshot: snapshot(habits: three, plan: .free), status: .live, now: now, calendar: cal)
        #expect(partial.state == .partial)
        #expect(partial.done == 2)
        #expect(partial.bestStreak == 23)

        let five = three + [habit("Water", false, 0), habit("Journal", true, 1)]
        let free = HabitsModel.make(snapshot: snapshot(habits: five, plan: .free), status: .live, now: now, calendar: cal)
        #expect(free.habits.count == 3)
        #expect(free.hidden == 2)
        let pro = HabitsModel.make(snapshot: snapshot(habits: five, plan: .pro), status: .live, now: now, calendar: cal)
        #expect(pro.habits.count == 5)
        #expect(pro.hidden == 0)

        #expect(HabitsModel.make(snapshot: snapshot(), status: .live, now: now, calendar: cal).state == .noHabits)
        #expect(HabitsModel.make(snapshot: snapshot(habits: [habit("a", true, 1)]), status: .live, now: now, calendar: cal).state == .allDone)
        #expect(HabitsModel.make(snapshot: snapshot(habits: [habit("a", false, 0)]), status: .live, now: now, calendar: cal).state == .noneLogged)
    }

    @Test func streakAtRiskOnlyInTheEvening() {
        let list = [habit("Duolingo", false, 23), habit("Gym", true, 3)]
        #expect(HabitsModel.make(snapshot: snapshot(habits: list), status: .live, now: at(10, 0), calendar: cal).state == .partial)
        let late = HabitsModel.make(snapshot: snapshot(habits: list), status: .live, now: at(19, 0), calendar: cal)
        #expect(late.state == .atRisk)
        #expect(late.riskHabit?.title == "Duolingo")
    }

    @Test func streakCountsYesterdayWhileTodayIsOpen() {
        #expect(WidgetRepository.streak([true, true, true, false]) == 3)
        #expect(WidgetRepository.streak([true, true, true, true]) == 4)
        #expect(WidgetRepository.streak([true, false, false]) == 0)
        #expect(WidgetRepository.streak([]) == 0)
    }

    @Test func planNames() {
        #expect(WidgetPlan(apiName: "FREE") == .free)
        #expect(WidgetPlan(apiName: "pro") == .pro)
        #expect(WidgetPlan(apiName: "LIFETIME") == .pro)
        #expect(WidgetPlan(apiName: nil) == .free)
    }

    // MARK: Quick add

    @Test func quickAddStates() {
        #expect(QuickAddModel.make(status: .live).state == .ready)
        #expect(QuickAddModel.make(status: .signedOut).state == .signedOut)
        #expect(QuickAddModel.make(status: .stale(now)).state == .offline)
    }

    // MARK: timelines and links

    @Test func timelineDatesAreSpacedAndBounded() {
        let b = [at(14, 22), at(14, 30), at(14, 31), at(15, 0), at(15, 0), at(23, 59, day: 28)]
        let d = WidgetTimelinePlan.dates(now: now, boundaries: b)
        #expect(d == [now, at(14, 30), at(15, 0)])
        #expect(WidgetTimelinePlan.dates(now: now, boundaries: (1...40).map { now.addingTimeInterval(Double($0) * 600) }).count <= WidgetTimelinePlan.maxEntries)
    }

    @Test func nextTimelineHasTheSoonMoment() {
        let call = WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0))
        let d = WidgetTimelinePlan.next(snapshot: snapshot(events: [call]), now: now)
        #expect(d == [now, at(14, 45), at(15, 0), at(16, 0)])
    }

    @Test func linksOnlyOpenNeedtRoutes() {
        #expect(NeedtLink.path(from: NeedtLink.today) == "/today")
        #expect(NeedtLink.path(from: NeedtLink.quickAdd) == "/quick-add")
        #expect(NeedtLink.path(from: NeedtLink.task("abc")) == "/tasks?task=abc")
        #expect((NeedtLink.path(from: URL(string: "needt://open?path=//evil.com")!)) == nil)
        #expect((NeedtLink.path(from: URL(string: "needt://open?path=https://evil.com")!)) == nil)
        #expect((NeedtLink.path(from: URL(string: "needt://open?path=/admin")!)) == nil)
        #expect((NeedtLink.path(from: URL(string: "https://use.needt.app/today")!)) == nil)
        #expect((NeedtLink.path(from: URL(string: "needt://auth?code=1")!)) == nil)
    }

    @Test func flashExpires() {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("flash-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        WidgetFlash.set(.toggleFailed, at: now, in: dir)
        #expect(WidgetFlash.isActive(.toggleFailed, now: now.addingTimeInterval(60), in: dir))
        #expect(!(WidgetFlash.isActive(.toggleFailed, now: now.addingTimeInterval(121), in: dir)))
        WidgetFlash.clear(in: dir)
        #expect(!(WidgetFlash.isActive(.toggleFailed, now: now, in: dir)))
    }
}

/// The repository against a stubbed network.
@Suite(.serialized) struct WidgetRepositoryTests {
    final class Stub: URLProtocol {
        nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data)?)?
        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            guard let result = Stub.handler?(request) else {
                client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
                return
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: result.0, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: result.1)
            client?.urlProtocolDidFinishLoading(self)
        }
        override func stopLoading() {}
    }

    private func repo(signedIn: Bool) -> (WidgetRepository, OfflineCache) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("repo-\(UUID().uuidString)")
        let vault = CookieVault(primary: nil, fallback: FileVaultStorage(url: dir.appendingPathComponent("session.json")))
        if signedIn {
            let cookie = HTTPCookie(properties: [.name: "s", .value: "v", .domain: "use.needt.app", .path: "/",
                                                 .expires: Date().addingTimeInterval(3600)])!
            vault.store([cookie])
        }
        let cache = OfflineCache(directory: dir.appendingPathComponent("cache"))
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Stub.self]
        return (WidgetRepository(baseURL: URL(string: "https://use.needt.app")!, vault: vault, cache: cache,
                                 session: URLSession(configuration: config)), cache)
    }

    private func body(for url: String) -> Data {
        switch url {
        case "/api/tasks":
            return Data("""
            [{"id":"t1","title":"Write report","status":"todo","scheduledStart":"2026-10-27T15:00:00.000Z",
              "estimatedMinutes":60,"project":{"id":"p1","name":"Work","color":"#5b4ee6"}},
             {"id":"t2","title":"Done thing","status":"completed","completedAt":"2026-10-27T09:00:00.000Z",
              "scheduledStart":"2026-10-27T09:00:00.000Z"}]
            """.utf8)
        case "/api/events":
            return Data("""
            [{"id":"e1","title":"Client call","start":"2026-10-27T15:00:00.000Z","end":"2026-10-27T16:00:00.000Z",
              "allDay":false,"location":"Zoom","feed":{"name":"Work","color":"#1f9d8a"}},
             {"id":"e2","title":"Declined","start":"2026-10-27T15:00:00.000Z","end":"2026-10-27T16:00:00.000Z","selfDeclined":true}]
            """.utf8)
        case "/api/habits":
            return Data(##"{"habits":[{"id":"h1","title":"Duolingo","color":"#8f7dff","isActive":true}]}"##.utf8)
        case "/api/habits/history?days=60":
            return Data(#"{"habits":[{"id":"h1","done":[1,1,1,0]}]}"#.utf8)
        case "/api/billing":
            return Data(#"{"plan":"PRO"}"#.utf8)
        case "/api/focus/session":
            return Data(#"{"active":false,"session":null}"#.utf8)
        default:
            return Data("{}".utf8)
        }
    }

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    @Test func signedOutWhenTheVaultIsEmpty() async {
        let (repo, _) = repo(signedIn: false)
        let load = await repo.load()
        #expect(load.status == .signedOut)
        #expect((load.snapshot) == nil)
    }

    @Test func loadBuildsASnapshotFromTheExistingRoutes() async {
        let (repo, cache) = repo(signedIn: true)
        Stub.handler = { [self] req in
            let path = req.url!.path + (req.url!.query.map { "?" + $0 } ?? "")
            return (200, body(for: path))
        }
        let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 27, hour: 14, minute: 20))!
        let load = await repo.load(now: now, calendar: cal)
        #expect(load.status == .live)
        let s = load.snapshot
        #expect(s?.plan == .pro)
        #expect(s?.tasks.count == 2)
        #expect(s?.tasks.first?.project?.color == "#5b4ee6")
        #expect(s?.events.map(\.id) == ["e1"])
        #expect(s?.habits.first?.streak == 3)
        #expect(s?.habits.first?.doneToday == false)
        #expect((s?.focus) == nil)
        #expect((cache.load(WidgetSnapshot.self, for: .widget)) != nil)
    }

    @Test func offlineFallsBackToTheLastSnapshotMarkedStale() async {
        let (repo, cache) = repo(signedIn: true)
        let saved = Date(timeIntervalSince1970: 1_800_000_000)
        cache.save(WidgetSnapshot(plan: .free, tasks: [TaskSummary(id: "t9", title: "Cached")], fetchedAt: saved), for: .widget, at: saved)
        Stub.handler = { _ in nil }
        let load = await repo.load()
        #expect(load.status == .stale(saved))
        #expect(load.snapshot?.tasks.first?.title == "Cached")
    }

    @Test func a401MeansSignedOut() async {
        let (repo, _) = repo(signedIn: true)
        Stub.handler = { _ in (401, Data()) }
        let load = await repo.load()
        #expect(load.status == .signedOut)
    }

    @Test func markTaskPatchesTheCache() async {
        let (repo, cache) = repo(signedIn: true)
        let saved = Date(timeIntervalSince1970: 1_800_000_000)
        cache.save(WidgetSnapshot(tasks: [TaskSummary(id: "t1", title: "A", status: "todo")], fetchedAt: saved), for: .widget, at: saved)
        repo.markTask("t1", done: true, now: saved.addingTimeInterval(5))
        let hit = repo.cached()
        #expect(hit?.value.tasks.first?.isDone == true)
        #expect(hit?.savedAt == saved)
    }
}
