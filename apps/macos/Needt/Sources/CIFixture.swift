import Foundation
import NeedtKit

/// CI only: `Needt --ci-fixture-data` runs the app as if a person were signed
/// in, without a network. Tasks, a ticking focus run and the "Start focus"
/// suggestion are fed to the menu-bar item and the island, and they change
/// every few seconds (a task arrives, the focus pauses, resumes and ends, a
/// task is completed), so that size-changing updates happen during the soak
/// the way they do on a real Mac after the first data arrives.
///
/// Nothing is read from or written to the account, the disk cache or the
/// network while the flag is on. Without the flag this file does nothing.
@MainActor
enum CIFixture {
    nonisolated static let enabled = CommandLine.arguments.contains("--ci-fixture-data")

    /// Posted at fixed phases so the island runs each moment, the hover peek and
    /// the volume HUD during the soak (userInfo["mode"]).
    nonisolated static let momentNotification = Notification.Name("app.needt.ci-fixture.island-moment")

    /// A full cycle is 20 steps, one step every 3 seconds (a minute).
    private static let cycle = 20
    private static var step = 0
    private static var timer: Timer?
    private static var focusEnd: Date?
    private static var focusTitle = "Draft the launch plan"

    private static let titles = [
        "Review the pull request", "Write the quarterly planning memo for the whole team",
        "Call the dentist", "Plan the offsite", "Reply to the investors", "Book flights to Berlin",
    ]

    static func start(tray: TrayStore) {
        guard enabled, timer == nil else { return }
        advance(tray)
        let t = Timer(timeInterval: 3, repeats: true) { _ in
            Task { @MainActor in advance(tray) }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private static func advance(_ tray: TrayStore) {
        step += 1
        let phase = step % cycle
        let cycleNumber = step / cycle
        // The focus run: starts at phase 2, pauses at 10, resumes at 12, ends at 14.
        switch phase {
        case 2:
            focusTitle = cycleNumber % 2 == 0 ? "Draft the launch plan" : "Write the quarterly planning memo for the whole team"
            focusEnd = Date().addingTimeInterval(25 * 60)
        case 12:
            focusEnd = Date().addingTimeInterval(14 * 60)
        case 14:
            focusEnd = nil
        default:
            break
        }
        let focusing = (2..<14).contains(phase)
        let paused = (10..<12).contains(phase)
        let count = visibleCount(phase)
        let open = Array(titles.prefix(count + (phase >= 15 ? 1 : 0)).dropFirst(phase >= 15 ? 1 : 0))
        let next = open.prefix(TrayState.maxTasks).enumerated().map { index, title in
            TrayTask(id: "fx-\(index)-\(title.count)", title: title, time: String(format: "%02d:30", 9 + index))
        }
        let state = TrayState(
            open: open.count + 2,
            overdue: (4..<10).contains(phase) ? 1 : 0,
            next: Array(next),
            focus: focusing ? (paused ? "Focus paused" : "Focus \(max(1, Int((focusEnd?.timeIntervalSinceNow ?? 0) / 60))) min left") : nil,
            focusEndsAt: focusing && !paused ? focusEnd.map { $0.timeIntervalSince1970 * 1000 } : nil,
            focusTitle: focusing ? focusTitle : nil
        )
        let moments = [4: "music", 6: "airpods", 8: "charge", 10: "volume", 16: "peek", 17: "unpeek", 18: "airpods-no-level"]
        if let mode = moments[phase] {
            NotificationCenter.default.post(name: momentNotification, object: nil, userInfo: ["mode": mode])
        }
        tray.setFixtureSuggestion(focusing ? nil : FocusSuggestion(taskId: "fx-0", title: titles[0], minutes: 25))
        tray.apply(state)
        FileHandle.standardError.write(Data("[ci-fixture] step \(step) tasks \(open.count) focus \(focusing)\n".utf8))
    }

    /// How many fixture tasks are open at a phase: they arrive, then one completes.
    private static func visibleCount(_ phase: Int) -> Int {
        switch phase {
        case 0..<6: return 3
        case 6..<9: return 4
        case 9..<12: return 5
        case 12..<15: return 6
        case 15..<18: return 5
        default: return 4
        }
    }

    /// The same tasks as `TaskSummary` values, for the island's lists.
    static func tasks() -> [TaskSummary] {
        let phase = step % cycle
        let start = Calendar.current.startOfDay(for: Date())
        let completedFirst = phase >= 15
        return titles.enumerated().compactMap { index, title -> TaskSummary? in
            guard index < visibleCount(phase) + (completedFirst ? 1 : 0) else { return nil }
            let begins = start.addingTimeInterval(TimeInterval((9 + index) * 3600 + 1800))
            return TaskSummary(
                id: "fx-\(index)-\(title.count)", title: title,
                status: completedFirst && index == 0 ? "completed" : "todo",
                scheduledStart: begins, scheduledEnd: begins.addingTimeInterval(1800),
                estimatedMinutes: 30
            )
        }
    }
}
