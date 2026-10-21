import XCTest
@testable import NeedtKit

final class FocusSyncTests: XCTestCase {
    func testTransitionsIgnoreTheFirstReport() {
        XCTAssertEqual(FocusSync.transition(previous: nil, current: true), .none)
        XCTAssertEqual(FocusSync.transition(previous: false, current: true), .started)
        XCTAssertEqual(FocusSync.transition(previous: true, current: false), .ended)
        XCTAssertEqual(FocusSync.transition(previous: true, current: true), .none)
        XCTAssertEqual(FocusSync.transition(previous: false, current: false), .none)
    }

    func testShortTitle() {
        XCTAssertNil(FocusSync.shortTitle(nil))
        XCTAssertNil(FocusSync.shortTitle("   "))
        XCTAssertEqual(FocusSync.shortTitle("Write docs"), "Write docs")
        let long = String(repeating: "a", count: 40)
        XCTAssertEqual(FocusSync.shortTitle(long, max: 10)?.count, 10)
        XCTAssertTrue(FocusSync.shortTitle(long, max: 10)?.hasSuffix("…") ?? false)
    }

    func testShortcutURL() {
        XCTAssertNil(FocusSync.shortcutURL(name: "  "))
        let url = FocusSync.shortcutURL(name: "Work Focus on")
        XCTAssertEqual(url?.scheme, "shortcuts")
        XCTAssertEqual(url?.host, "run-shortcut")
        XCTAssertEqual(
            URLComponents(url: url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value,
            "Work Focus on"
        )
    }

    func testTrayStateFocusHelpers() {
        let on = TrayState(open: 1, overdue: 0, next: [], focus: "Focus 5 min left",
                           focusEndsAt: 1_900_000_000_000, focusTitle: "A")
        XCTAssertTrue(on.isFocusActive)
        XCTAssertEqual(on.focusEndDate, Date(timeIntervalSince1970: 1_900_000_000))
        XCTAssertFalse(TrayState.empty.isFocusActive)
        XCTAssertNil(TrayState.empty.focusEndDate)
    }

    func testFocusRunIsStillDecodeOnly() throws {
        let json = #"{"open":2,"overdue":0,"next":[],"focusRun":{"title":"Deep work","endsAt":1900000000000}}"#
        let state = try JSONDecoder().decode(TrayState.self, from: Data(json.utf8))
        XCTAssertEqual(state.focusTitle, "Deep work")
        XCTAssertEqual(state.focusEndsAt, 1_900_000_000_000)
        let encoded = String(data: try JSONEncoder().encode(state), encoding: .utf8) ?? ""
        XCTAssertFalse(encoded.contains("focusRun"))
    }

    func testPickTaskPrefersProjectThenNext() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let tasks = [
            TaskSummary(id: "a", title: "A", status: "todo", scheduledStart: now.addingTimeInterval(600), projectId: "p1"),
            TaskSummary(id: "b", title: "B", status: "todo", scheduledStart: now.addingTimeInterval(60), projectId: "p2"),
            TaskSummary(id: "c", title: "C", status: "completed", scheduledStart: now.addingTimeInterval(30), projectId: "p1"),
            TaskSummary(id: "d", title: "D", status: "todo", projectId: "p1"),
        ]
        XCTAssertEqual(FocusFilterState(mode: .suggest, projectId: "p1").pickTask(from: tasks, now: now)?.id, "a")
        XCTAssertEqual(FocusFilterState(mode: .suggest).pickTask(from: tasks, now: now)?.id, "b")
        // Nothing scheduled in the project: the first open one.
        let unscheduled = [TaskSummary(id: "d", title: "D", status: "todo", projectId: "p9")]
        XCTAssertEqual(FocusFilterState(mode: .start, projectId: "p9").pickTask(from: unscheduled, now: now)?.id, "d")
        XCTAssertNil(FocusFilterState(mode: .start, projectId: "none").pickTask(from: tasks, now: now))
    }

    func testFilterStoreRoundTripAndMissingFileIsOff() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ff-\(UUID().uuidString).json")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = FocusFilterStore(url: url)
        XCTAssertEqual(store.load().mode, .off)
        store.save(FocusFilterState(mode: .start, projectId: "p1", projectName: "Launch", minutes: 50))
        let hit = store.load()
        XCTAssertEqual(hit.mode, .start)
        XCTAssertEqual(hit.projectId, "p1")
        XCTAssertEqual(hit.minutes, 50)
        XCTAssertEqual(FocusFilterState(mode: .start, minutes: 9999).minutes, 240)
    }
}
