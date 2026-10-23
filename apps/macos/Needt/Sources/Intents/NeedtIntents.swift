import AppIntents
import Foundation
import NeedtKit

// Siri, Spotlight and Shortcuts actions. They call the same HTTP API as the
// web app (NeedtKit.NeedtAPI) with the vault's session; nothing here talks to
// the database. Offline, reads answer from the disk cache and writes stop with
// the reason.

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add task"
    static var description = IntentDescription("Adds a task to Needt.")

    @Parameter(title: "Title")
    var taskTitle: String

    @Parameter(title: "Project")
    var project: ProjectEntity?

    @Parameter(title: "Due")
    var due: Date?

    @Parameter(title: "Minutes")
    var minutes: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$taskTitle)") {
            \.$project
            \.$due
            \.$minutes
        }
    }

    func perform() async throws -> some IntentResult & ReturnsValue<TaskEntity> & ProvidesDialog {
        let name = taskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw IntentFailure(message: "A task needs a title.") }
        let task = try await IntentSupport.run { api in
            try await api.createTask(
                .init(title: name, projectId: project?.id, dueDate: due, durationMinutes: minutes)
            )
        }
        return .result(value: IntentSupport.entity(task), dialog: "Added \(task.title).")
    }
}

struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete task"
    static var description = IntentDescription("Marks a Needt task as done.")

    @Parameter(title: "Task")
    var task: TaskEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Complete \(\.$task)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await IntentSupport.run { try await $0.completeTask(id: task.id) }
        return .result(dialog: "Completed \(task.title).")
    }
}

struct StartFocusIntent: AppIntent {
    static var title: LocalizedStringResource = "Start focus"
    static var description = IntentDescription("Starts a Needt focus run, on a task if you pick one.")

    @Parameter(title: "Task")
    var task: TaskEntity?

    @Parameter(title: "Minutes", default: 25)
    var minutes: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Start focus") {
            \.$task
            \.$minutes
        }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let length = min(max(minutes, 1), 240)
        let started = try await IntentSupport.run { api in
            try await api.startFocus(taskId: task?.id, plannedMinutes: length, intention: task?.title)
        }
        await MainActor.run {
            AppController.shared.tray.nativeFocusStarted(started, title: task?.title, minutes: length)
        }
        return .result(dialog: "Focus started for \(length) minutes.")
    }
}

struct EndFocusIntent: AppIntent {
    static var title: LocalizedStringResource = "End focus"
    static var description = IntentDescription("Ends the running Needt focus.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ended = try await IntentSupport.run { api -> Bool in
            guard let session = try await api.activeFocusSession() else { return false }
            try await api.stopFocus(sessionId: session.id, completed: false)
            return true
        }
        guard ended else { return .result(dialog: "No focus is running.") }
        await MainActor.run { AppController.shared.tray.nativeFocusEnded() }
        return .result(dialog: "Focus ended.")
    }
}

struct TodayIntent: AppIntent {
    static var title: LocalizedStringResource = "What's today"
    static var description = IntentDescription("Reads out what is planned for today.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let result = try await IntentSupport.run { try await $0.tasksCached() }
        var text = Digest.todayText(result.value)
        if let note = result.note() { text += "\n" + note }
        return .result(value: text, dialog: "\(text)")
    }
}

struct NextTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "What's next"
    static var description = IntentDescription("Reads out the next thing on your plan.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let result = try await IntentSupport.run { try await $0.tasksCached() }
        var text = Digest.nextText(Digest.next(result.value))
        if let note = result.note() { text += "\n" + note }
        return .result(value: text, dialog: "\(text)")
    }
}

struct ReplanDayIntent: AppIntent {
    static var title: LocalizedStringResource = "Replan day"
    static var description = IntentDescription("Asks Needt to plan your open tasks again.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await IntentSupport.run { try await $0.replan() }
        return .result(dialog: "Replanning your day.")
    }
}

struct LogHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Log habit"
    static var description = IntentDescription("Marks a habit as done for today.")

    @Parameter(title: "Habit")
    var habit: HabitEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$habit)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await IntentSupport.run { try await $0.logHabitToday(id: habit.id) }
        return .result(dialog: "Logged \(habit.title).")
    }
}

struct NeedtShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: ["Add a task in \(.applicationName)", "New task in \(.applicationName)"],
            shortTitle: "Add task",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: TodayIntent(),
            phrases: ["What's today in \(.applicationName)", "My day in \(.applicationName)"],
            shortTitle: "What's today",
            systemImageName: "sun.max"
        )
        AppShortcut(
            intent: NextTaskIntent(),
            phrases: ["What's next in \(.applicationName)"],
            shortTitle: "What's next",
            systemImageName: "arrow.right.circle"
        )
        AppShortcut(
            intent: StartFocusIntent(),
            phrases: ["Start focus in \(.applicationName)"],
            shortTitle: "Start focus",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: EndFocusIntent(),
            phrases: ["End focus in \(.applicationName)"],
            shortTitle: "End focus",
            systemImageName: "stop.circle"
        )
        AppShortcut(
            intent: CompleteTaskIntent(),
            phrases: ["Complete a task in \(.applicationName)"],
            shortTitle: "Complete task",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: ReplanDayIntent(),
            phrases: ["Replan my day in \(.applicationName)"],
            shortTitle: "Replan day",
            systemImageName: "arrow.triangle.2.circlepath"
        )
        AppShortcut(
            intent: LogHabitIntent(),
            phrases: ["Log a habit in \(.applicationName)"],
            shortTitle: "Log habit",
            systemImageName: "repeat"
        )
    }
}
