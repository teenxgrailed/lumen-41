import XCTest
@testable import NeedtKit

final class IslandPrefsTests: XCTestCase {
    func testMissingKeysAreDefaults() {
        let data = Data(#"{"theme":"dark","prefs":{}}"#.utf8)
        XCTAssertEqual(IslandPrefs.decode(settingsJSON: data), IslandPrefs())
        XCTAssertEqual(IslandPrefs.decode(settingsJSON: Data("nonsense".utf8)), IslandPrefs())
        let p = IslandPrefs()
        XCTAssertTrue(p.show)
        XCTAssertEqual(p.hoverDelay, 0.3)
        XCTAssertEqual(p.warnMinutes, 5)
        XCTAssertEqual(p.standbySeconds, 30)
        XCTAssertEqual(p.displays, .builtIn)
        XCTAssertFalse(p.sounds)
        XCTAssertFalse(p.hud)
        XCTAssertEqual(p.visibleModules, [.music, .cal, .shelf, .dev])
        XCTAssertEqual(DesktopPrefs.decode(settingsJSON: data), DesktopPrefs())
    }

    func testReadsFlatKeysAndIgnoresWrongTypes() {
        let json = #"""
        {"prefs":{"islandShow":false,"islandPeek":"off","islandHoverDelay":"0.6","islandOpenOn":"hover",
        "islandWarning":"10","islandStandby":"60","islandWeek":false,"islandDisplays":"all",
        "islandModuleOrder":"clipboard,music,bogus,clipboard","islandClipboard":true,"islandMusic":false,
        "islandHud":true,"islandMomentAirpods":false,"islandMomentDone":"yes","islandSounds":true,
        "islandOnPlanQuiet":false}}
        """#
        let p = IslandPrefs.decode(settingsJSON: Data(json.utf8))
        XCTAssertFalse(p.show)
        XCTAssertFalse(p.peek)
        XCTAssertEqual(p.hoverDelay, 0.6)
        XCTAssertEqual(p.openOn, .hover)
        XCTAssertEqual(p.warnMinutes, 10)
        XCTAssertEqual(p.standbySeconds, 60)
        XCTAssertEqual(p.displays, .all)
        XCTAssertEqual(p.visibleTabs, [.today, .focus])
        XCTAssertFalse(p.moments.airpods)
        XCTAssertTrue(p.moments.done, "a string is not a Bool, so the default stays")
        XCTAssertTrue(p.sounds)
        XCTAssertFalse(p.showNothingOnPlan)
        // Order kept, the unknown id and the duplicate dropped, the rest appended.
        XCTAssertEqual(p.modules.first?.id, .clip)
        XCTAssertEqual(p.modules[1], IslandPrefs.ModuleSetting(id: .music, on: false))
        XCTAssertEqual(p.modules.count, IslandModuleID.allCases.count)
        XCTAssertEqual(p.visibleModules, [.clip, .cal, .shelf, .dev, .hud])
        XCTAssertTrue(p.hud)
    }

    func testOffAndNumbers() {
        let json = #"{"prefs":{"islandWarning":"off","islandStandby":"off","islandHoverDelay":1,"islandDisplays":"main"}}"#
        let p = IslandPrefs.decode(settingsJSON: Data(json.utf8))
        XCTAssertEqual(p.warnMinutes, 0)
        XCTAssertEqual(p.standbySeconds, 0)
        XCTAssertEqual(p.hoverDelay, 1)
        XCTAssertEqual(p.displays, .main)
        // Off means no call, ever.
        XCTAssertEqual(IslandCadence.call(secondsLeft: 20, hasNext: true, warnMinutes: p.warnMinutes, standbySeconds: p.standbySeconds), .none)
        XCTAssertEqual(IslandCadence.call(secondsLeft: 100, hasNext: true, warnMinutes: p.warnMinutes, standbySeconds: p.standbySeconds), .none)
    }

    func testWrongValuesKeepDefaults() {
        let json = #"{"prefs":{"islandWarning":"7","islandStandby":"x","islandOpenOn":"tap","islandDisplays":"none"}}"#
        let p = IslandPrefs.decode(settingsJSON: Data(json.utf8))
        XCTAssertEqual(p.warnMinutes, 5)
        XCTAssertEqual(p.standbySeconds, 30)
        XCTAssertEqual(p.openOn, .click)
        XCTAssertEqual(p.displays, .builtIn)
    }

    func testDesktopPrefs() {
        let json = #"{"prefs":{"macDockBadge":"off","macMenuIcon":"always","macQuickAddKeys":"⌘ K","macFocusMode":"work","macMenuTimer":false,"widgetStyle":"B","widgetTitlesLocked":true,"widgetHabits":"3"}}"#
        let p = DesktopPrefs.decode(settingsJSON: Data(json.utf8))
        XCTAssertEqual(p.dockBadge, .off)
        XCTAssertEqual(p.menuIcon, .always)
        XCTAssertEqual(p.quickAddKeys, "⌘ K")
        XCTAssertEqual(p.focusMode, .work)
        XCTAssertFalse(p.menuTimer)
        XCTAssertEqual(p.widgetStyle, "B")
        XCTAssertTrue(p.widgetTitlesLocked)
        XCTAssertEqual(p.widgetHabits, .three)
        XCTAssertEqual(DesktopPrefs.decode(settingsJSON: Data(#"{"prefs":{"macDockBadge":"x","widgetStyle":"Z"}}"#.utf8)), DesktopPrefs())
    }

    func testBarIsNeverEmpty() {
        var p = IslandPrefs()
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
