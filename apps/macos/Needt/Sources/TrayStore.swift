import AppKit
import NeedtKit
import WebKit

struct FocusSuggestion: Equatable {
    let taskId: String
    let title: String
    let minutes: Int
}

/// What the menu bar item, its menu and the Dock badge show. Fed by the web
/// app's `needt-tray-state` report (about once a minute and on change). The
/// menu-bar countdown is a system `Text(timerInterval:)` fed by `focusEndsAt`.
@MainActor
final class TrayStore: ObservableObject {
    @Published private(set) var state: TrayState = .empty
    @Published private(set) var focusError: String?
    /// "Start focus: task" while a macOS Focus filter set to suggest is on.
    @Published private(set) var suggestion: FocusSuggestion?

    /// The session id for Pause / End, fetched on demand through NeedtAPI.
    private var session: FocusSession?

    lazy var api = NeedtAPI(baseURL: Config.base) {
        await WebCookies.all()
    }

    var isFocusPaused: Bool {
        state.focus?.lowercased().contains("paused") ?? false
    }

    /// The web app's own report (`needt-tray-state`).
    func report(_ next: TrayState) {
        FocusBridge.shared.reported(active: next.isFocusActive)
        apply(next)
    }

    func apply(_ next: TrayState) {
        SessionSync.push()
        state = next
        updateDockBadge()
    }

    /// Signed out: nothing of the previous person stays in the menu.
    func reset() {
        apply(.empty)
        FocusBridge.shared.reset()
        suggestion = nil
        session = nil
    }

    private func updateDockBadge() {
        // Overdue only: red means "needs you now". Hidden at zero.
        NSApp.dockTile.badgeLabel = state.overdue > 0 ? String(state.overdue) : nil
    }

    // MARK: focus started or ended outside the page (Siri, Shortcuts, Spotlight)

    /// A focus run the page did not start: show it now. The page's own report
    /// replaces this within a minute once a window is open.
    func nativeFocusStarted(_ started: FocusSession?, title: String?, minutes: Int) {
        FocusBridge.shared.nativeChange(active: true)
        suggestion = nil
        var next = state
        next.focus = "Focus \(minutes) min left"
        next.focusTitle = title
        let begin = started?.startedAt ?? Date()
        next.focusEndsAt = (begin.timeIntervalSince1970 + Double(minutes) * 60) * 1000
        apply(next)
    }

    func nativeFocusEnded() {
        FocusBridge.shared.nativeChange(active: false)
        var next = state
        next.focus = nil
        next.focusEndsAt = nil
        next.focusTitle = nil
        apply(next)
    }

    // MARK: focus controls (through the HTTP API, same session as the page)

    private func currentSession() async -> FocusSession? {
        if let fresh = try? await api.activeFocusSession() {
            session = fresh
            return fresh
        }
        return nil
    }

    func togglePauseFocus() {
        Task {
            guard let current = await currentSession() else { return }
            do {
                if current.isPaused {
                    try await api.resumeFocus(sessionId: current.id)
                } else {
                    try await api.pauseFocus(sessionId: current.id)
                }
                focusError = nil
                // The page reports the new state within a minute and on focus;
                // reflect it now so the menu does not lag.
                var next = state
                next.focus = current.isPaused ? next.focus : "Focus paused"
                if !current.isPaused { next.focusEndsAt = nil }
                apply(next)
            } catch {
                focusError = "Could not reach Needt"
            }
        }
    }

    func endFocus() {
        Task {
            guard let current = await currentSession() else { return }
            do {
                try await api.stopFocus(sessionId: current.id, completed: false)
                focusError = nil
                nativeFocusEnded()
            } catch {
                focusError = Self.message(for: error)
            }
        }
    }

    func startFocusOnNextTask() {
        guard let task = state.next.first else { return }
        startFocus(taskId: task.id, title: task.title, minutes: FocusFilterState.defaultMinutes)
    }

    func startFocus(taskId: String?, title: String?, minutes: Int) {
        Task {
            do {
                try await startFocusNow(taskId: taskId, title: title, minutes: minutes)
                focusError = nil
            } catch {
                focusError = Self.message(for: error)
            }
        }
    }

    func startFocusNow(taskId: String?, title: String?, minutes: Int) async throws {
        let started = try await api.startFocus(taskId: taskId, plannedMinutes: minutes, intention: title)
        nativeFocusStarted(started, title: title, minutes: minutes)
    }

    private static func message(for error: Error) -> String {
        (error as? NeedtAPIError)?.message ?? "Could not reach Needt"
    }

    // MARK: macOS Focus filter

    /// The Focus filter changed (its intent ran): update the suggestion and,
    /// when it asks for it, start the focus.
    func focusFilterChanged() async {
        let filter = FocusFilterStore.shared.load()
        guard filter.mode != .off else {
            suggestion = nil
            return
        }
        let open: [TaskSummary]
        do {
            open = try await api.tasksCached().value.filter { !$0.isDone && $0.trashedAt == nil }
        } catch {
            suggestion = nil
            return
        }
        guard let task = filter.pickTask(from: open) else {
            suggestion = nil
            return
        }
        switch filter.mode {
        case .suggest:
            suggestion = state.isFocusActive ? nil : FocusSuggestion(taskId: task.id, title: task.title, minutes: filter.minutes)
        case .start:
            suggestion = nil
            guard !state.isFocusActive else { return }
            try? await startFocusNow(taskId: task.id, title: task.title, minutes: filter.minutes)
        case .off:
            break
        }
    }

    func startSuggested() {
        guard let s = suggestion else { return }
        suggestion = nil
        startFocus(taskId: s.taskId, title: s.title, minutes: s.minutes)
    }
}

/// The session cookies live in the web view's data store; the API client
/// borrows them so native calls are signed in as the same person.
@MainActor
enum WebCookies {
    static func all() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
    }
}
