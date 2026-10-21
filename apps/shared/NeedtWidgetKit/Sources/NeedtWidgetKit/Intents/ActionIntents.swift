import AppIntents
import Foundation
import NeedtKit
import WidgetKit

// What a button or toggle in a widget does. They run in the widget extension
// (the app is not woken), call Needt's own API with the session in the shared
// vault, patch the cached snapshot so the reload shows the result at once, and
// on failure leave the "Could not sync" mark.

enum WidgetActions {
    static func reloadAll() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Runs `work`; on any failure leaves the failure mark and rethrows nothing
    /// (a widget intent should not show an error sheet).
    static func run(_ work: () async throws -> Void, revert: () -> Void) async {
        do {
            try await work()
            WidgetFlash.clear()
        } catch {
            revert()
            WidgetFlash.set(.toggleFailed)
        }
        reloadAll()
    }

    static func api() -> NeedtAPI {
        let vault = CookieVault.shared
        return NeedtAPI(baseURL: WidgetEnvironment.baseURL) { vault.load() }
    }
}

public struct ToggleTaskIntent: SetValueIntent {
    public static var title: LocalizedStringResource = "Mark task done"
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Task") public var taskId: String
    @Parameter(title: "Done") public var value: Bool

    public init() {}
    public init(taskId: String) { self.taskId = taskId }

    public func perform() async throws -> some IntentResult {
        let id = taskId, done = value
        let repo = WidgetRepository()
        repo.markTask(id, done: done)
        await WidgetActions.run({
            if done { try await WidgetActions.api().completeTask(id: id) } else { try await WidgetActions.api().reopenTask(id: id) }
        }, revert: { repo.markTask(id, done: !done) })
        return .result()
    }
}

public struct ToggleHabitIntent: SetValueIntent {
    public static var title: LocalizedStringResource = "Log habit"
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Habit") public var habitId: String
    @Parameter(title: "Done") public var value: Bool

    public init() {}
    public init(habitId: String) { self.habitId = habitId }

    public func perform() async throws -> some IntentResult {
        let id = habitId, done = value
        let repo = WidgetRepository()
        repo.markHabit(id, done: done)
        await WidgetActions.run({
            if done { try await WidgetActions.api().logHabitToday(id: id) } else { try await WidgetActions.api().unlogHabitToday(id: id) }
        }, revert: { repo.markHabit(id, done: !done) })
        return .result()
    }
}

public struct StartFocusWidgetIntent: AppIntent {
    public static var title: LocalizedStringResource = "Start focus"
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Minutes") public var minutes: Int

    public init() { minutes = FocusFilterState.defaultMinutes }
    public init(minutes: Int) { self.minutes = minutes }

    public func perform() async throws -> some IntentResult {
        let m = minutes
        await WidgetActions.run({
            _ = try await WidgetActions.api().startFocus(taskId: nil, plannedMinutes: m, origin: "widget")
        }, revert: {})
        return .result()
    }
}

public struct ToggleFocusPauseWidgetIntent: AppIntent {
    public static var title: LocalizedStringResource = "Pause or resume focus"
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Session") public var sessionId: String
    @Parameter(title: "Paused") public var paused: Bool

    public init() {}
    public init(sessionId: String, paused: Bool) {
        self.sessionId = sessionId
        self.paused = paused
    }

    public func perform() async throws -> some IntentResult {
        let id = sessionId, wasPaused = paused
        await WidgetActions.run({
            if wasPaused { try await WidgetActions.api().resumeFocus(sessionId: id) } else { try await WidgetActions.api().pauseFocus(sessionId: id) }
        }, revert: {})
        return .result()
    }
}

public struct FinishFocusWidgetIntent: AppIntent {
    public static var title: LocalizedStringResource = "Finish focus"
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Session") public var sessionId: String

    public init() {}
    public init(sessionId: String) { self.sessionId = sessionId }

    public func perform() async throws -> some IntentResult {
        let id = sessionId
        await WidgetActions.run({
            try await WidgetActions.api().stopFocus(sessionId: id, completed: true)
        }, revert: {})
        return .result()
    }
}

/// The Quick add Control and widget: opens Needt on the capture screen.
/// Widgets have no text field, so this only launches; the app picks the link
/// up from the shared container when it comes forward.
public struct OpenQuickAddIntent: AppIntent {
    public static var title: LocalizedStringResource = "Add a task"
    public static var description = IntentDescription("Opens Needt on the capture screen.")
    public static var openAppWhenRun: Bool { true }

    public init() {}

    public func perform() async throws -> some IntentResult {
        PendingLink.set(NeedtLink.quickAdd)
        return .result()
    }
}
