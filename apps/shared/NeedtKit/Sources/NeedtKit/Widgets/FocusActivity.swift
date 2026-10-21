import Foundation

/// "Show titles on Lock Screen": off by default. The Lock Screen, StandBy and
/// the Mac menu bar can be read by a bystander, so a focus title only appears
/// there when the person turns this on (the Live Activity reads it; the
/// widgets carry the same choice in their Edit menu).
public enum WidgetPrivacy {
    private static func url(_ directory: URL) -> URL { directory.appendingPathComponent("show-titles-on-lock-screen.txt") }

    public static func showTitlesOnLockScreen(in directory: URL = SharedContainer.directory()) -> Bool {
        (try? String(contentsOf: url(directory), encoding: .utf8)) == "1"
    }

    public static func setShowTitlesOnLockScreen(_ on: Bool, in directory: URL = SharedContainer.directory()) {
        try? Data((on ? "1" : "0").utf8).write(to: url(directory), options: .atomic)
    }
}

/// How long a finished focus summary stays on the Lock Screen and the Mac
/// menu bar before the system removes it (HIG: 15 to 30 minutes).
public enum FocusActivityPolicy {
    public static let dismissalAfterEnd: TimeInterval = 20 * 60
    /// ActivityKit keeps an activity at most 8 hours; focus blocks are far shorter.
    public static let maxDuration: TimeInterval = 8 * 3600
}

#if os(iOS) && canImport(ActivityKit)
import ActivityKit

/// The Live Activity of a focus block: compact ring + timer in the Dynamic
/// Island, expanded and Lock Screen presentations with one outlined Pause.
@available(iOS 16.2, *)
public struct NeedtFocusAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String?
        /// Start of the countdown interval (paused time already added).
        public var start: Date
        /// End of the countdown; nil for an open-ended run.
        public var end: Date?
        /// Set while paused: the countdown is frozen at this time.
        public var pausedAt: Date?
        public var plannedMinutes: Int
        public var upNext: String?
        /// The run is over: the summary shows until the dismissal time.
        public var ended: Bool
        /// False hides the title on the Lock Screen (privacySensitive).
        public var showTitle: Bool

        public init(title: String?, start: Date, end: Date?, pausedAt: Date?, plannedMinutes: Int,
                    upNext: String?, ended: Bool, showTitle: Bool) {
            self.title = title
            self.start = start
            self.end = end
            self.pausedAt = pausedAt
            self.plannedMinutes = plannedMinutes
            self.upNext = upNext
            self.ended = ended
            self.showTitle = showTitle
        }

        public var interval: ClosedRange<Date>? {
            guard let end, end > start else { return nil }
            return start...end
        }
    }

    public var sessionId: String

    public init(sessionId: String) { self.sessionId = sessionId }
}

@available(iOS 16.2, *)
public enum FocusActivityState {
    public static func make(from focus: WidgetFocus, upNext: String?, ended: Bool = false) -> NeedtFocusAttributes.ContentState {
        NeedtFocusAttributes.ContentState(
            title: focus.title, start: focus.effectiveStart, end: focus.endDate, pausedAt: focus.pausedAt,
            plannedMinutes: focus.plannedMinutes ?? 0, upNext: upNext, ended: ended,
            showTitle: WidgetPrivacy.showTitlesOnLockScreen()
        )
    }
}

/// App side: starts, updates and ends the activity so it follows the server's
/// focus session. Called when the app comes forward and while it is active; a
/// push token for updates while the app is in the background needs APNs and is
/// not wired yet (//todo).
@available(iOS 16.2, *)
public final class FocusActivityController: @unchecked Sendable {
    public static let shared = FocusActivityController()

    public init() {}

    private var current: Activity<NeedtFocusAttributes>? {
        Activity<NeedtFocusAttributes>.activities.first
    }

    /// Makes the activity match `snapshot.focus`.
    public func reconcile(snapshot: WidgetSnapshot?, now: Date = Date()) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let upNext = snapshot?.tasks.filter { !$0.isDone }.sorted { ($0.when ?? .distantFuture) < ($1.when ?? .distantFuture) }.first
            .map { "\($0.title) \(Digest.timeLabel($0.when) ?? "")".trimmingCharacters(in: .whitespaces) }
        guard let focus = snapshot?.focus, !focus.isBreak else {
            await end(now: now)
            return
        }
        if focus.hasEnded(at: now) {
            await end(now: now, last: focus, upNext: upNext)
            return
        }
        let state = FocusActivityState.make(from: focus, upNext: upNext)
        if let activity = current, activity.attributes.sessionId == focus.sessionId {
            await activity.update(ActivityContent(state: state, staleDate: focus.endDate))
        } else {
            for old in Activity<NeedtFocusAttributes>.activities { await old.end(nil, dismissalPolicy: .immediate) }
            _ = try? Activity.request(
                attributes: NeedtFocusAttributes(sessionId: focus.sessionId),
                content: ActivityContent(state: state, staleDate: focus.endDate),
                pushType: nil
            )
        }
    }

    /// Ends right away; the summary stays 15 to 30 minutes (20), then goes.
    public func end(now: Date = Date(), last: WidgetFocus? = nil, upNext: String? = nil) async {
        for activity in Activity<NeedtFocusAttributes>.activities {
            var state = activity.content.state
            if let last { state = FocusActivityState.make(from: last, upNext: upNext, ended: true) } else { state.ended = true }
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                dismissalPolicy: .after(now.addingTimeInterval(FocusActivityPolicy.dismissalAfterEnd))
            )
        }
    }
}
#endif

#if os(iOS) && canImport(AppIntents) && canImport(ActivityKit)
import ActivityKit
import AppIntents

/// The Pause / Resume button in the Live Activity. A LiveActivityIntent runs in
/// the app's process, so it lives here, in a library both the app and the
/// widget extension link.
@available(iOS 17.0, *)
public struct PauseFocusActivityIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource { "Pause or resume focus" }
    public static var isDiscoverable: Bool { false }

    @Parameter(title: "Session") public var sessionId: String
    @Parameter(title: "Paused") public var paused: Bool

    public init() {}
    public init(sessionId: String, paused: Bool) {
        self.sessionId = sessionId
        self.paused = paused
    }

    public func perform() async throws -> some IntentResult {
        let vault = CookieVault.shared
        let api = NeedtAPI(baseURL: WidgetEnvironment.baseURL) { vault.load() }
        if paused { try? await api.resumeFocus(sessionId: sessionId) } else { try? await api.pauseFocus(sessionId: sessionId) }
        let load = await WidgetRepository().load()
        await FocusActivityController.shared.reconcile(snapshot: load.snapshot)
        return .result()
    }
}

/// "Show titles on Lock Screen" as an action in Shortcuts and Settings.
@available(iOS 17.0, *)
public struct ShowTitlesOnLockScreenIntent: AppIntent {
    public static var title: LocalizedStringResource { "Show titles on Lock Screen" }
    public static var description: IntentDescription {
        IntentDescription("Choose whether task and event titles appear on the Lock Screen and in the Dynamic Island. Off by default.")
    }

    @Parameter(title: "Show titles", default: false) public var value: Bool

    public init() {}
    public init(value: Bool) { self.value = value }

    public func perform() async throws -> some IntentResult {
        WidgetPrivacy.setShowTitlesOnLockScreen(value)
        return .result()
    }
}

/// Declared in both the app and the widget extension so each finds these
/// intents in the NeedtKit package.
@available(iOS 17.0, *)
public struct NeedtKitIntentsPackage: AppIntentsPackage {}
#endif
