import AppKit

/// The one place the app talks to the notch island (the code in `Island/`).
/// The island runs inside Needt.app; Needt's AppDelegate owns the lifecycle
/// and calls these.
@MainActor
enum IslandHost {
    private static var started = false

    static func start(_ notification: Notification) {
        guard !started else { return }
        started = true
        IslandAppDelegate.current().applicationDidFinishLaunching(notification)
    }

    static func stop(_ notification: Notification) {
        guard started else { return }
        IslandAppDelegate.current().applicationWillTerminate(notification)
    }

    /// Files dropped on the Dock icon or opened with Needt go to the Shelf.
    static func open(_ urls: [URL]) {
        guard started, !urls.isEmpty else { return }
        IslandAppDelegate.current().application(NSApp, open: urls)
    }
}
