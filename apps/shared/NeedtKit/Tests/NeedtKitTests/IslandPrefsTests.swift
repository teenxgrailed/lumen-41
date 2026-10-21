import XCTest
@testable import NeedtKit

final class IslandPrefsTests: XCTestCase {
    func testMissingBlockIsDefaults() {
        let data = Data(#"{"theme":"dark","prefs":{}}"#.utf8)
        XCTAssertEqual(IslandPrefs.decode(settingsJSON: data), IslandPrefs())
        XCTAssertEqual(IslandPrefs.decode(settingsJSON: Data("nonsense".utf8)), IslandPrefs())
    }

    func testReadsKeysAndIgnoresWrongTypes() {
        let json = #"""
        {"prefs":{"island":{"show":false,"peek":"yes","hoverDelay":0.4,"openOn":"hover",
        "warnMinutes":7,"standbySeconds":9999,"tabs":{"week":false},
        "modules":[{"id":"clip","on":true},{"id":"music","on":false},{"id":"bogus"},{"id":"clip"}],
        "moments":{"airpods":false}}}}
        """#
        let p = IslandPrefs.decode(settingsJSON: Data(json.utf8))
        XCTAssertFalse(p.show)
        XCTAssertTrue(p.peek, "a string is not a Bool, so the default stays")
        XCTAssertEqual(p.hoverDelay, 0.4)
        XCTAssertEqual(p.openOn, .hover)
        XCTAssertEqual(p.warnMinutes, 7)
        XCTAssertEqual(p.standbySeconds, 120, "clamped")
        XCTAssertEqual(p.visibleTabs, [.today, .focus])
        XCTAssertFalse(p.moments.airpods)
        XCTAssertTrue(p.moments.music)
        // Order kept, the unknown id dropped, the duplicate dropped, the rest appended.
        XCTAssertEqual(p.modules.first?.id, .clip)
        XCTAssertEqual(p.modules.count, IslandModuleID.allCases.count)
        XCTAssertEqual(p.modules[1], IslandPrefs.ModuleSetting(id: .music, on: false))
        XCTAssertFalse(p.visibleModules.contains(.music))
    }

    func testBarIsNeverEmpty() {
        var p = IslandPrefs()
        p.tabs = IslandPrefs.Tabs()
        p.tabs.today = false; p.tabs.week = false; p.tabs.focus = false
        XCTAssertEqual(p.visibleTabs, [.today])
    }

    func testCadence() {
        func call(_ s: Int, next: Bool = true) -> IslandCall {
            IslandCadence.call(secondsLeft: s, hasNext: next, warnMinutes: 5, standbySeconds: 30)
        }
        XCTAssertEqual(call(900), .none)
        XCTAssertEqual(call(300), .warning)
        XCTAssertEqual(call(31), .warning)
        XCTAssertEqual(call(30), .standby)
        XCTAssertEqual(call(1), .standby)
        XCTAssertEqual(call(0), .none)
        XCTAssertEqual(call(200, next: false), .none)
    }

    func testOverrideFromPinnedTaskOrPausedFocus() {
        let cal = Calendar(identifier: .gregorian)
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let later = now.addingTimeInterval(3600)
        let pinned = TaskSummary(id: "a1", title: "Gym", scheduledStart: later, scheduledEnd: later.addingTimeInterval(3600), scheduleLocked: true)
        let free = TaskSummary(id: "b2", title: "Call", scheduledStart: later, scheduleLocked: false)
        XCTAssertNil(IslandOverrides.detect(tasks: [free], focusPaused: false, now: now, calendar: cal))
        XCTAssertEqual(IslandOverrides.detect(tasks: [free], focusPaused: true, now: now, calendar: cal)?.text, "Your focus is paused")
        let o = IslandOverrides.detect(tasks: [free, pinned], focusPaused: false, now: now, calendar: cal)
        XCTAssertEqual(o?.taskIds, ["a1"])
        XCTAssertTrue(o?.text.hasPrefix("You moved Gym to") ?? false)
        let done = TaskSummary(id: "c3", title: "Old", status: "completed", scheduledStart: later, scheduleLocked: true)
        XCTAssertNil(IslandOverrides.detect(tasks: [done], focusPaused: false, now: now, calendar: cal))
    }

    func testWeekLoad() {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        cal.timeZone = TimeZone(identifier: "UTC")!
        let monday = cal.date(from: DateComponents(year: 2026, month: 10, day: 26, hour: 9))!
        let tasks = [
            TaskSummary(id: "a", title: "A", scheduledStart: monday, scheduledEnd: monday.addingTimeInterval(7200)),
            TaskSummary(id: "b", title: "B", scheduledStart: monday.addingTimeInterval(36000), estimatedMinutes: 45),
            TaskSummary(id: "c", title: "C", status: "completed", scheduledStart: monday)
        ]
        let days = IslandWeek.days(tasks, now: monday, calendar: cal)
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days[0].minutes, 165)
        XCTAssertTrue(days[0].isToday)
        XCTAssertEqual(days[1].minutes, 0)
        XCTAssertEqual(IslandWeek.hoursLabel(0), "—")
        XCTAssertEqual(IslandWeek.hoursLabel(90), "1 h 30")
        XCTAssertEqual(IslandWeek.hoursLabel(240), "4 h")
    }
}
