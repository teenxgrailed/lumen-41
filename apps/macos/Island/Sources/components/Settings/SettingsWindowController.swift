import AppKit

/// The island has no settings window of its own any more: its settings are the
/// Island pane in Needt's Settings. Everything in the island that used to open
/// its own window ends up here.
final class SettingsWindowController: NSObject {
    static let shared = SettingsWindowController()

    private override init() { super.init() }

    func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}
