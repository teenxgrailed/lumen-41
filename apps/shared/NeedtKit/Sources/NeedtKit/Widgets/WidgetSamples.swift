import Foundation

extension NeedtAPI {
    /// Re-opens a task the person un-ticked.
    public func reopenTask(id: String) async throws {
        guard TrayState.validID(id) else { throw NeedtAPIError.badResponse }
        _ = try await request("/api/tasks/\(id)", method: "PUT", body: ["status": "todo"])
    }

    public func unlogHabitToday(id: String) async throws {
        guard TrayState.validID(id) else { throw NeedtAPIError.badResponse }
        _ = try await request("/api/habits/\(id)/completions/today", method: "DELETE")
    }
}

/// Realistic simulated data: the same Tuesday 27 October, 14:20 the design
/// uses everywhere. Used for the widget gallery, previews and the snapshot
/// images CI renders to compare with the HTML.
public enum WidgetSamples {
    /// Tue 27 Oct 2026, 14:20 in the given calendar.
    public static func now(calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: 27, hour: 14, minute: 20)) ?? Date()
    }

    public static func snapshot(now: Date, calendar: Calendar = .current, plan: WidgetPlan = .pro) -> WidgetSnapshot {
        func at(_ h: Int, _ m: Int) -> Date {
            calendar.date(bySettingHour: h, minute: m, second: 0, of: now) ?? now
        }
        func project(_ name: String, _ color: String) -> ProjectSummary { ProjectSummary(id: "p-" + name, name: name, color: color) }
        let work = project("Work", "#5b4ee6"), study = project("Study", "#1f9d8a")
        let home = project("Home", "#f0a020"), body = project("Body", "#e5484d"), lang = project("Languages", "#0ea5e9")
        func task(_ id: String, _ title: String, _ h: Int, _ m: Int, done: Bool, minutes: Int? = nil, _ p: ProjectSummary) -> TaskSummary {
            TaskSummary(id: id, title: title, status: done ? "completed" : "todo", scheduledStart: at(h, m),
                        estimatedMinutes: minutes, completedAt: done ? at(h, m) : nil, project: p)
        }
        let tasks = [
            task("t1", "Reply to emails", 9, 30, done: true, work),
            task("t2", "Review the lecture", 11, 0, done: true, study),
            task("t3", "Write the weekly report", 15, 0, done: false, minutes: 60, work),
            task("t4", "Call mom", 16, 30, done: false, minutes: 20, home),
            task("t5", "Gym", 18, 0, done: false, minutes: 60, body),
            task("t6", "Duolingo", 21, 0, done: false, minutes: 15, lang),
        ]
        let events = [
            WidgetEvent(id: "e1", title: "Client call", start: at(15, 0), end: at(16, 0), location: "Zoom", colorHex: "#5b4ee6"),
            WidgetEvent(id: "e2", title: "Padel", start: at(17, 30), end: at(18, 30), colorHex: "#0ea5e9"),
        ]
        let habits = [
            WidgetHabit(id: "h1", title: "Duolingo", colorHex: "#8f7dff", doneToday: true, streak: 23,
                        history: Array(repeating: true, count: 28)),
            WidgetHabit(id: "h2", title: "Gym", colorHex: "#e5484d", doneToday: false, streak: 2,
                        history: [true, false, true, true, false, true, false, true, true, false, true, false, true, true,
                                  false, false, true, true, false, true, true, false, true, false, true, true, true, false]),
            WidgetHabit(id: "h3", title: "Read 20 pages", colorHex: "#f0a020", doneToday: true, streak: 9,
                        history: Array(repeating: true, count: 9) + [false] + Array(repeating: true, count: 9) + [false, true] + Array(repeating: true, count: 7)),
        ]
        let focus = WidgetFocus(sessionId: "f1", title: "Deep work on the main project", taskId: nil, plannedMinutes: 25,
                                startedAt: now.addingTimeInterval(-7 * 60))
        return WidgetSnapshot(plan: plan, tasks: tasks, events: events, habits: habits, focus: focus,
                              lastFocusTitle: "Deep work", fetchedAt: now)
    }
}
