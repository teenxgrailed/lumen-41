import AppIntents
import NeedtKit
import WidgetKit

// App Shortcuts: say "Add a task in Needt", "Start focus in Needt" or "What is
// today in Needt" to Siri, or run them from Spotlight and the Shortcuts app.
// They call Needt's own API with the session the app keeps in the shared vault
// (the same path the widgets use) and do not open the app. This file lives in
// the app target because the system reads the AppShortcutsProvider from there.
// //todo: the widget intents in NeedtWidgetKit (ActionIntents) are not reused:
// linking that package would pull every widget view into the app binary.

enum ShortcutFailure: Error, CustomLocalizedStringResourceConvertible {
    case signedOut, offline, failed

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .signedOut: return "Open Needt and sign in first."
        case .offline: return "You are offline. Try again when you have a connection."
        case .failed: return "Needt could not do that. Try again."
        }
    }

    static func from(_ error: Error) -> ShortcutFailure {
        guard let api = error as? NeedtAPIError else { return .failed }
        switch api {
        case .notSignedIn: return .signedOut
        case .offline: return .offline
        default: return .failed
        }
    }
}

private func shortcutAPI() -> NeedtAPI {
    let vault = CookieVault.shared
    return NeedtAPI(baseURL: WidgetEnvironment.baseURL) { vault.load() }
}

struct AddTaskShortcutIntent: AppIntent {
    static var title: LocalizedStringResource = "Add task to Needt"
    static var description = IntentDescription("Adds a task to Needt without opening the app.")
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "Task", requestValueDialog: "What is the task?")
    var name: String

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$name) to Needt")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let title = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard !title.isEmpty else { throw ShortcutFailure.failed }
        do {
            try await shortcutAPI().createTask(.init(title: title))
        } catch {
            throw ShortcutFailure.from(error)
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result(dialog: "Added to Needt.")
    }
}

struct StartFocusShortcutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Needt focus session"
    static var description = IntentDescription("Starts a focus timer in Needt.")
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "Minutes", default: 25)
    var minutes: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Start a \(\.$minutes) minute focus session")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let planned = max(1, min(minutes, 240))
        do {
            _ = try await shortcutAPI().startFocus(taskId: nil, plannedMinutes: planned, origin: "shortcut")
        } catch {
            throw ShortcutFailure.from(error)
        }
        let load = await WidgetRepository().load()
        await FocusActivityController.shared.reconcile(snapshot: load.snapshot)
        WidgetCenter.shared.reloadAllTimelines()
        return .result(dialog: "Focus started for \(planned) minutes.")
    }
}

struct TodayShortcutIntent: AppIntent {
    static var title: LocalizedStringResource = "What is on today in Needt"
    static var description = IntentDescription("Tells you what is left on today's list.")
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let load = await WidgetRepository().load()
        if load.status == .signedOut { throw ShortcutFailure.signedOut }
        guard let snapshot = load.snapshot else { throw ShortcutFailure.offline }
        let open = Digest.today(snapshot.tasks)
        let spoken: String
        if let first = open.first {
            spoken = "\(open.count) \(open.count == 1 ? "item" : "items") today. Next: \(Digest.line(first))."
        } else {
            spoken = "Nothing planned for today."
        }
        return .result(value: Digest.todayText(snapshot.tasks), dialog: IntentDialog(stringLiteral: spoken))
    }
}

struct NeedtShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskShortcutIntent(),
            phrases: ["Add a task in \(.applicationName)", "New task in \(.applicationName)"],
            shortTitle: "Add task",
            systemImageName: "plus"
        )
        AppShortcut(
            intent: StartFocusShortcutIntent(),
            phrases: ["Start focus in \(.applicationName)", "Start a focus session in \(.applicationName)"],
            shortTitle: "Start focus",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: TodayShortcutIntent(),
            phrases: ["What is today in \(.applicationName)", "Show my day in \(.applicationName)"],
            shortTitle: "Today",
            systemImageName: "calendar"
        )
    }
}
