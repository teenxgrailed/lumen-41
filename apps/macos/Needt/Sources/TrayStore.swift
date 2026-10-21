import AppKit
import NeedtKit
import WebKit

/// What the menu bar item, its menu and the Dock badge show. Fed by the web
/// app's `needt-tray-state` report (about once a minute and on change); the
/// countdown between reports is counted here from `focusEndsAt`.
@MainActor
final class TrayStore: ObservableObject {
    @Published private(set) var state: TrayState = .empty
    /// "18:42" while a focus counts down, else nil. Shown beside the menu-bar icon.
    @Published private(set) var clock: String?
    @Published private(set) var focusError: String?

    private var timer: Timer?
    /// The session id for Pause / End, fetched on demand through NeedtAPI.
    private var session: FocusSession?

    lazy var api = NeedtAPI(baseURL: Config.base) {
        await WebCookies.all()
    }

    var isFocusPaused: Bool {
        state.focus?.lowercased().contains("paused") ?? false
    }

    func apply(_ next: TrayState) {
        SessionSync.push()
        state = next
        refreshClock()
        updateDockBadge()
        updateTimer()
    }

    /// Signed out: nothing of the previous person stays in the menu.
    func reset() {
        apply(.empty)
        session = nil
    }

    private func updateDockBadge() {
        // Overdue only: red means "needs you now". Hidden at zero.
        NSApp.dockTile.badgeLabel = state.overdue > 0 ? String(state.overdue) : nil
    }

    private func refreshClock() {
        if let left = state.focusSecondsLeft() {
            clock = formatClock(left)
        } else {
            clock = nil
        }
    }

    private func updateTimer() {
        guard state.focusSecondsLeft() != nil else {
            timer?.invalidate()
            timer = nil
            return
        }
        guard timer == nil else { return }
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.refreshClock()
                if self.clock == nil { self.updateTimer() }
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    // MARK: focus started or ended outside the page (Siri, Shortcuts, Spotlight)

    /// A focus run the page did not start: show it now. The page's own report
    /// replaces this within a minute once a window is open.
    func nativeFocusStarted(_ started: FocusSession?, title: String?, minutes: Int) {
        var next = state
        next.focus = "Focus \(minutes) min left"
        next.focusTitle = title
        let begin = started?.startedAt ?? Date()
        next.focusEndsAt = (begin.timeIntervalSince1970 + Double(minutes) * 60) * 1000
        apply(next)
    }

    func nativeFocusEnded() {
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
                var next = state
                next.focus = nil
                next.focusEndsAt = nil
                next.focusTitle = nil
                apply(next)
            } catch {
                focusError = "Could not reach Needt"
            }
        }
    }

    func startFocusOnNextTask() {
        guard let task = state.next.first else { return }
        Task {
            do {
                if let started = try await api.startFocus(taskId: task.id, plannedMinutes: 25, intention: task.title) {
                    var next = state
                    next.focus = "Focus 25 min left"
                    next.focusTitle = task.title
                    next.focusEndsAt = (started.startedAt.timeIntervalSince1970 + 25 * 60) * 1000
                    apply(next)
                }
                focusError = nil
            } catch {
                focusError = "Could not reach Needt"
            }
        }
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
