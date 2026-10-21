import AppKit
import NeedtKit

/// Needt focus start and end run a Shortcut the person chose (which turns a
/// macOS Focus on or off). The trigger is the focus state itself, so it works
/// the same whether the run began in the web app, the menu bar, Siri or a
/// Focus filter; each start and end fires once.
@MainActor
final class FocusBridge {
    static let shared = FocusBridge()

    enum Keys {
        static let startShortcut = "focusStartShortcut"
        static let endShortcut = "focusEndShortcut"
    }

    /// nil until the first report: opening the app mid-run is not a start.
    private var lastActive: Bool?

    /// The web app's report of the current state.
    func reported(active: Bool) {
        let transition = FocusSync.transition(previous: lastActive, current: active)
        lastActive = active
        fire(transition)
    }

    /// A change made here (menu, Siri, Shortcuts, Focus filter): counts even
    /// when no report came before.
    func nativeChange(active: Bool) {
        let transition = FocusSync.transition(previous: lastActive ?? !active, current: active)
        lastActive = active
        fire(transition)
    }

    func reset() { lastActive = nil }

    private func fire(_ transition: FocusSync.Transition) {
        switch transition {
        case .started: run(UserDefaults.standard.string(forKey: Keys.startShortcut))
        case .ended: run(UserDefaults.standard.string(forKey: Keys.endShortcut))
        case .none: break
        }
    }

    private func run(_ name: String?) {
        guard let name, let url = FocusSync.shortcutURL(name: name) else { return }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
        NSWorkspace.shared.open(url, configuration: configuration, completionHandler: nil)
    }
}
