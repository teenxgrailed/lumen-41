import AppKit
import Combine
import Defaults

extension Defaults.Keys {
    /// The master switch in Settings, Island.
    static let needtIslandEnabled = Key<Bool>("needtIslandEnabled", default: true)
}

/// The one place the app talks to the notch island (the code in `Island/`).
/// The island runs inside Needt.app; Needt's AppDelegate owns the lifecycle
/// and calls these. The island is on only for Pro and only while the master
/// switch is on.
@MainActor
enum IslandHost {
    private static var started = false
    private static var observing: AnyCancellable?

    /// Called once at launch.
    static func begin() {
        observing = Defaults.publisher(.needtIslandEnabled, options: [])
            .sink { _ in Task { @MainActor in apply() } }
        IslandEntitlement.shared.start()
        apply()
    }

    static var isOn: Bool {
        IslandEntitlement.shared.isPro && Defaults[.needtIslandEnabled]
    }

    /// Starts, shows or hides the island to match the plan and the switch.
    static func apply() {
        if isOn {
            if started {
                IslandAppDelegate.current().setHostEnabled(true)
            } else {
                started = true
                IslandAppDelegate.current().applicationDidFinishLaunching(
                    Notification(name: NSApplication.didFinishLaunchingNotification)
                )
            }
        } else if started {
            IslandAppDelegate.current().setHostEnabled(false)
        }
    }

    static func stop(_ notification: Notification) {
        guard started else { return }
        IslandAppDelegate.current().applicationWillTerminate(notification)
    }

    /// Files dropped on the Dock icon or opened with Needt go to the Shelf.
    static func open(_ urls: [URL]) {
        guard started, isOn, !urls.isEmpty else { return }
        IslandAppDelegate.current().application(NSApp, open: urls)
    }
}
