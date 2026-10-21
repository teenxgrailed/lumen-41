import AppKit
import SwiftUI

@main
struct NeedtApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        // Windows are AppKit (see AppController); SwiftUI owns the menu-bar item.
        MenuBarExtra {
            MenuBarContent(tray: AppController.shared.tray)
        } label: {
            MenuBarLabel(tray: AppController.shared.tray)
        }
        .menuBarExtraStyle(.menu)

        Settings {
            SettingsView()
        }
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
        _ = Connectivity.shared
        Notifier.shared.start()
        Updater.shared.start()
        installMainMenu()
        AppController.shared.start()
        Task { await AppController.shared.tray.focusFilterChanged() }
        // SwiftUI installs its own menu bar around the scene; keep ours on top.
        DispatchQueue.main.async { [weak self] in self?.installMainMenu() }
    }

    @MainActor
    func applicationDidBecomeActive(_ notification: Notification) {
        if NSApp.mainMenu?.items.first?.title != "Needt" || (NSApp.mainMenu?.items.count ?? 0) < 6 {
            installMainMenu()
        }
    }

    @MainActor
    private func installMainMenu() {
        NSApp.mainMenu = MainMenuBuilder.shared.build()
    }

    @MainActor
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "needt" {
            AppController.shared.auth.handleDeepLink(url)
        }
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
