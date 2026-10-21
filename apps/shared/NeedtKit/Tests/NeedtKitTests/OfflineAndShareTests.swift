import XCTest
@testable import NeedtKit

final class OfflineAndShareTests: XCTestCase {
    private func tempDir() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("needt-test-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func utc() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    // MARK: cache

    func testCacheRoundTripKeepsTasksAndSaveTime() {
        let cache = OfflineCache(directory: tempDir())
        let saved = Date(timeIntervalSince1970: 1_800_000_000)
        let tasks = [TaskSummary(id: "t1", title: "Write", status: "todo",
                                 dueDate: Date(timeIntervalSince1970: 1_800_003_600), estimatedMinutes: 30)]
        cache.save(tasks, for: .tasks, at: saved)
        let hit = cache.load([TaskSummary].self, for: .tasks)
        XCTAssertEqual(hit?.value, tasks)
        XCTAssertEqual(hit?.savedAt, saved)
        XCTAssertNil(cache.load([TaskSummary].self, for: .today))
    }

    func testCacheKeepsTrayState() {
        let cache = OfflineCache(directory: tempDir())
        let state = TrayState(open: 3, overdue: 1, next: [TrayTask(id: "a", title: "A", time: "09:00")],
                              focus: "Focus 5 min left", focusEndsAt: 1_900_000_000_000, focusTitle: "A")
        cache.save(state, for: .tray)
        let hit = cache.load(TrayState.self, for: .tray)
        XCTAssertEqual(hit?.value.open, 3)
        XCTAssertEqual(hit?.value.next.first?.title, "A")
        XCTAssertEqual(hit?.value.focusEndsAt, 1_900_000_000_000)
    }

    func testCorruptFileReadsAsMissingAndClearWorks() throws {
        let dir = tempDir()
        let cache = OfflineCache(directory: dir)
        try Data("not json".utf8).write(to: dir.appendingPathComponent("tasks.json"))
        XCTAssertNil(cache.load([TaskSummary].self, for: .tasks))
        cache.save([TaskSummary(id: "x", title: "X")], for: .tasks)
        cache.clear()
        XCTAssertNil(cache.load([TaskSummary].self, for: .tasks))
    }

    func testOfflineNote() {
        var cal = utc()
        cal.locale = Locale(identifier: "en_US_POSIX")
        let base: Double = 1_800_000_000
        let startOfDay: Double = base - base.truncatingRemainder(dividingBy: 86_400)
        let date = Date(timeIntervalSince1970: startOfDay + 14 * 3600 + 5 * 60)
        XCTAssertEqual(OfflineCache.note(updatedAt: date, calendar: cal), "Offline · updated 14:05")
        XCTAssertEqual(ReadResult(value: 1, staleSince: date).note(calendar: cal), "Offline · updated 14:05")
        XCTAssertNil(ReadResult(value: 1, staleSince: nil).note(calendar: cal))
    }

    // MARK: cookie vault

    private func cookie(_ name: String, domain: String, expires: Date? = nil) -> HTTPCookie {
        var props: [HTTPCookiePropertyKey: Any] = [.name: name, .value: "v-\(name)", .domain: domain, .path: "/", .secure: "TRUE"]
        if let expires { props[.expires] = expires }
        return HTTPCookie(properties: props)!
    }

    func testVaultStoresOnlyNeedtCookiesAndDropsExpired() {
        let vault = CookieVault(primary: nil, fallback: FileVaultStorage(url: tempDir().appendingPathComponent("s.json")))
        let future = Date().addingTimeInterval(3600)
        let ok = vault.store([
            cookie("session", domain: "use.needt.app", expires: future),
            cookie("stale", domain: ".needt.app", expires: Date().addingTimeInterval(-10)),
            cookie("other", domain: "example.com", expires: future),
        ])
        XCTAssertTrue(ok)
        XCTAssertEqual(vault.load().map(\.name), ["session"])
        XCTAssertEqual(vault.load().first?.value, "v-session")
        vault.clear()
        XCTAssertTrue(vault.load().isEmpty)
    }

    func testVaultWithNothingToStoreReportsFalse() {
        let vault = CookieVault(primary: nil, fallback: FileVaultStorage(url: tempDir().appendingPathComponent("s.json")))
        XCTAssertFalse(vault.store([cookie("x", domain: "example.com")]))
    }

    // MARK: digest

    func testTodayAndNext() {
        let cal = utc()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let start = cal.startOfDay(for: now)
        let tasks = [
            TaskSummary(id: "a", title: "Later today", status: "todo", scheduledStart: start.addingTimeInterval(72_000)),
            TaskSummary(id: "b", title: "Overdue", status: "todo", dueDate: start.addingTimeInterval(-54_000)),
            TaskSummary(id: "c", title: "Done", status: "completed", dueDate: start.addingTimeInterval(3600)),
            TaskSummary(id: "d", title: "Tomorrow", status: "todo", dueDate: start.addingTimeInterval(90_000)),
            TaskSummary(id: "e", title: "Trashed", status: "todo", dueDate: start.addingTimeInterval(3600), trashedAt: now),
            TaskSummary(id: "f", title: "No date", status: "todo"),
        ]
        XCTAssertEqual(Digest.today(tasks, now: now, calendar: cal).map(\.id), ["b", "a"])
        XCTAssertEqual(Digest.next(tasks, now: now)?.id, "a")
        XCTAssertEqual(Digest.nextText(nil), "Nothing coming up.")
        XCTAssertEqual(Digest.todayText([], now: now, calendar: cal), "Nothing planned for today.")
        XCTAssertTrue(Digest.todayText(tasks, now: now, calendar: cal).hasPrefix("2 items today:"))
    }

    // MARK: share

    func testShareDraftFromPageWithTitle() {
        let d = ShareDraft.make(title: "Swift Concurrency", text: nil, url: URL(string: "https://example.com/a")!)
        XCTAssertEqual(d.title, "Swift Concurrency")
        XCTAssertEqual(d.notes, "https://example.com/a")
    }

    func testShareDraftFromBareURLUsesHost() {
        let d = ShareDraft.make(title: nil, text: "https://example.com/a", url: nil)
        XCTAssertEqual(d.title, "example.com")
        XCTAssertEqual(d.notes, "https://example.com/a")
    }

    func testShareDraftFromTextUsesFirstLine() {
        let d = ShareDraft.make(title: nil, text: "Call Anna\nabout the contract", url: nil)
        XCTAssertEqual(d.title, "Call Anna")
        XCTAssertEqual(d.notes, "Call Anna\nabout the contract")
        let single = ShareDraft.make(title: nil, text: "Buy milk", url: nil)
        XCTAssertEqual(single.title, "Buy milk")
        XCTAssertNil(single.notes)
    }

    // MARK: request body

    func testNewTaskBody() {
        let body = NeedtAPI.NewTask(title: "T", notes: "n", projectId: "p1", dueDate: Date(timeIntervalSince1970: 0), durationMinutes: 45).body
        XCTAssertEqual(body["title"] as? String, "T")
        XCTAssertEqual(body["duration"] as? Int, 45)
        XCTAssertEqual(body["projectId"] as? String, "p1")
        XCTAssertEqual(body["dueDate"] as? String, "1970-01-01T00:00:00Z")
        XCTAssertNil(NeedtAPI.NewTask(title: "T").body["description"])
    }

    func testFocusRunDecodeOnlyShapeStillParses() {
        let state = TrayState.parse(json: ["open": 1, "focusRun": ["title": "Deep work", "endsAt": 4_102_444_800_000.0]])
        XCTAssertEqual(state?.focusTitle, "Deep work")
        XCTAssertNotNil(state?.focusSecondsLeft())
    }
}
