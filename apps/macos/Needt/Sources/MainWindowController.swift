import AppKit
import WebKit

/// The main window: the web interface under a transparent, full-size title
/// bar. The page's own top bar is the title bar; the traffic lights sit over
/// its left end at (18, 20), and `data-tauri-drag-region` elements drag it.
@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate, BridgeHost {
    static let trafficLightOrigin = NSPoint(x: 18, y: 20)
    static let titleBarHeight: CGFloat = 52

    let web: NeedtWebView

    init(url: URL) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Needt"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 900, height: 600)
        window.collectionBehavior = [.fullScreenPrimary]

        // Opaque window: the page paints its own ground everywhere.
        let container = NSView()
        container.autoresizingMask = [.width, .height]
        window.contentView = container

        self.web = NeedtWebView()
        super.init(window: window)
        window.delegate = self
        web.bridgeHost = self

        let webView = web.webView
        webView.frame = container.bounds
        webView.autoresizingMask = [.width, .height]
        container.addSubview(webView)
        web.offlineHost.frame = container.bounds
        web.offlineHost.autoresizingMask = [.width, .height]
        container.addSubview(web.offlineHost)

        web.onSignedOut = {
            AppController.shared.auth.signedOut()
        }

        // Size and position come back the way the person left them.
        if !window.setFrameUsingName("NeedtMain") {
            window.center()
        }
        window.setFrameAutosaveName("NeedtMain")

        web.load(url)
        positionTrafficLights()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    // MARK: traffic lights

    /// Moves the three buttons to (18, 20) from the top-left corner and makes
    /// the title bar 52 pt tall so they are not clipped. The system lays them
    /// out again on resize and full screen, so this runs after those too.
    func positionTrafficLights() {
        guard let window,
              let close = window.standardWindowButton(.closeButton),
              let mini = window.standardWindowButton(.miniaturizeButton),
              let zoom = window.standardWindowButton(.zoomButton),
              let bar = close.superview?.superview
        else { return }
        guard !window.styleMask.contains(.fullScreen) else { return }

        let height = Self.titleBarHeight
        var frame = bar.frame
        frame.size.height = height
        frame.origin.y = window.frame.height - height
        bar.frame = frame

        let pitch: CGFloat = 20
        let y = (height - close.frame.height) / 2
        for (index, button) in [close, mini, zoom].enumerated() {
            button.setFrameOrigin(NSPoint(x: Self.trafficLightOrigin.x + CGFloat(index) * pitch, y: y))
        }
    }

    func windowDidResize(_ notification: Notification) { positionTrafficLights() }
    func windowDidEndLiveResize(_ notification: Notification) { positionTrafficLights() }
    func windowDidBecomeKey(_ notification: Notification) { positionTrafficLights() }
    func windowDidExitFullScreen(_ notification: Notification) { positionTrafficLights() }
    func windowDidChangeBackingProperties(_ notification: Notification) { positionTrafficLights() }

    /// Closing keeps the app in the menu bar, like the Tauri app did.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    // MARK: BridgeHost

    func bridgeDidRequestDrag(_ event: NSEvent?) {
        guard let window, let event, event.type == .leftMouseDown else { return }
        window.performDrag(with: event)
    }

    func bridgeDidRequestZoom() {
        window?.performZoom(nil)
    }

    // MARK: actions

    func show() {
        guard let window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        positionTrafficLights()
    }

    func send(_ command: [String: Any]) {
        WebBridge.dispatch(command, to: web.webView)
    }
}
