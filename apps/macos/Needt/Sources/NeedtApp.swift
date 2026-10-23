import AppKit
import NeedtKit

/// Plain AppKit entry point. There is no SwiftUI `App`: a SwiftUI scene
/// owns a window whose hosting view publishes its size, which loops in
/// "Update Constraints in Window" when the content changes size. The
/// menu-bar item is `StatusItemController`, the Settings window is
/// `AppController.showMacSettings`; both are AppKit.
@main
enum NeedtMain {
    private static var delegate: AppDelegate?

    @MainActor
    static func main() {
        let app = NSApplication.shared
        let appDelegate = AppDelegate()
        delegate = appDelegate
        app.delegate = appDelegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        // One instance: a second launch only brings the running one forward
        // (and a needt:// link is routed to the running one by the system).
        guard let id = Bundle.main.bundleIdentifier else { return }
        let me = ProcessInfo.processInfo.processIdentifier
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: id).filter { $0.processIdentifier != me }
        if let running = others.first {
            running.activate()
            NSApp.terminate(nil)
        }
    }

    @MainActor
    func applicationDidFinishLaunching(_ notification: Notification) {
        // CI: draw every island state to PNG and quit (no account, no window).
        if let directory = IslandV3Render.outputDirectory {
            let count = IslandV3Render.run(into: directory)
            exit(count > 0 ? 0 : 2)
        }
        _ = Connectivity.shared
        Notifier.shared.start()
        Updater.shared.start()
        installMainMenu()
        AppController.shared.start()
        IslandHost.begin()
        StatusItemController.shared.start(tray: AppController.shared.tray)
        CIFixture.start(tray: AppController.shared.tray)
        Task { await AppController.shared.tray.focusFilterChanged() }
    }

    /// The island (and anything else) asks for Settings with this action.
    @MainActor
    @objc func showSettingsWindow(_ sender: Any?) {
        AppController.shared.showMacSettings()
    }

    @MainActor
    func applicationDidBecomeActive(_ notification: Notification) {
        if NSApp.mainMenu?.items.first?.title != "Needt" || (NSApp.mainMenu?.items.count ?? 0) < 6 {
            installMainMenu()
        }
        // The Quick add Control (or a widget) opened the app: show what it asked for.
        if let link = PendingLink.take() { openWidgetLink(link) }
    }

    /// `needt://open?path=/today` from a widget or Control: only Needt's own
    /// routes are accepted (NeedtLink.path). Quick add uses the native panel.
    @MainActor
    private func openWidgetLink(_ url: URL) {
        guard let path = NeedtLink.path(from: url) else { return }
        if path == "/quick-add" {
            AppController.shared.showQuickAdd()
        } else {
            AppController.shared.navigate(path)
        }
    }

    @MainActor
    private func installMainMenu() {
        NSApp.mainMenu = MainMenuBuilder.shared.build()
    }

    @MainActor
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "needt" {
            if url.host == "open" { openWidgetLink(url) } else { AppController.shared.auth.handleDeepLink(url) }
        }
        IslandHost.open(urls.filter(\.isFileURL))
    }

    @MainActor
    func applicationWillTerminate(_ notification: Notification) {
        IslandHost.stop(notification)
    }

    /// A click on a task in Spotlight.
    @MainActor
    func application(_ application: NSApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([NSUserActivityRestoring]) -> Void) -> Bool {
        guard let id = SpotlightIndex.taskID(from: userActivity) else { return false }
        AppController.shared.openTask(id: id)
        return true
    }

    // Closing the window keeps the app in the menu bar.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// A Dock click with no visible window brings the app back.
    @MainActor
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { AppController.shared.showMain() }
        return true
    }
}
