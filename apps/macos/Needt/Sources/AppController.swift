import AppKit
import Carbon.HIToolbox
import SwiftUI

/// Owns the windows and what flows between them: the start window, the main
/// window, quick add, the menu-bar state and the sign-in.
@MainActor
final class AppController {
    static let shared = AppController()

    let auth = AuthFlow()
    let tray = TrayStore()
    let quickAdd = QuickAddController()

    private var main: MainWindowController?
    private var startWindow: NSWindow?
    private var hotKey: GlobalHotKey?
    /// A main window made for a sign-in that has not finished stays hidden
    /// until the page reports it is signed in.
    private var revealOnSignIn = false

    var hasStartWindow: Bool { startWindow?.isVisible ?? false }

    // MARK: launch

    func start() {
        hotKey = GlobalHotKey(
            keyCode: kVK_Space,
            modifiers: cmdKey | shiftKey
        ) { [weak self] in
            self?.showQuickAdd()
        }
        if auth.isSignedInBefore {
            showMain()
        } else {
            showStart()
        }
    }

    // MARK: main window

    /// "Open Needt": the main window, else the start window, else launch again.
    func showMain() {
        if let main {
            main.show()
            return
        }
        if let startWindow, startWindow.isVisible {
            startWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        guard auth.isSignedInBefore else {
            showStart()
            return
        }
        let controller = MainWindowController(url: Config.homeURL)
        main = controller
        controller.show()
    }

    /// The deep link brought a code: load the completion page in the main
    /// window (made now if there is none), but keep it hidden until signed in.
    func loadSignInCompletion(_ url: URL) {
        if let main {
            main.web.load(url)
            if main.window?.isVisible == true { main.show() } else { revealOnSignIn = true }
            return
        }
        let controller = MainWindowController(url: url)
        main = controller
        revealOnSignIn = true
    }

    /// The page reported a session: the start window has done its job.
    func signInFinished() {
        if revealOnSignIn {
            revealOnSignIn = false
            main?.show()
        }
        if let startWindow {
            startWindow.orderOut(nil)
            self.startWindow = nil
        }
    }

    /// The completion page never reported a session: forget the half-made window.
    func discardUnfinishedMain() {
        guard revealOnSignIn else { return }
        revealOnSignIn = false
        main?.window?.orderOut(nil)
        main?.window?.delegate = nil
        main?.window?.contentView = nil
        main = nil
    }

    // MARK: start window

    func showStart() {
        if let startWindow {
            startWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 520),
            styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Needt"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.standardWindowButton(.zoomButton)?.isEnabled = false
        let hosting = NSHostingView(rootView: StartView(auth: auth).frame(width: 440, height: 520))
        // The window is 440 x 520 and fixed; the content must not resize it.
        hosting.sizingOptions = []
        window.contentView = hosting
        window.center()
        startWindow = window
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: window, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.startWindow = nil }
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Signed out: the start window first, then drop the main window.
    func showStartAfterSignOut() {
        showStart()
        if let controller = main {
            controller.window?.delegate = nil
            controller.window?.orderOut(nil)
            controller.window?.contentView = nil
            main = nil
        }
        revealOnSignIn = false
    }

    // MARK: commands

    /// Hands a command to the web app (`DesktopCommand` in src/lib/desktop.ts).
    /// Nothing happens without a main window: commands never create one.
    func sendCommand(_ command: [String: Any]) {
        guard let main else { return }
        main.show()
        main.send(command)
    }

    func navigate(_ path: String) {
        sendCommand(["type": "navigate", "path": path])
    }

    /// View, Reload.
    func reload() {
        main?.web.reload()
    }

    func showQuickAdd() {
        guard auth.isSignedInBefore else { return }
        quickAdd.show()
    }

    func openWebsite() {
        NSWorkspace.shared.open(Config.site)
    }
}
