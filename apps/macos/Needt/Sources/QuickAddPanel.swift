import AppKit
import WebKit

/// A borderless panel that can take the keyboard even though it has no title bar.
private final class KeyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// Quick add (⇧⌘Space from anywhere): a borderless, always-on-top 620 pt
/// panel in the upper third of the active screen, loading the web app's own
/// quick-add page so it shares the composer's parser. It goes away on Esc or
/// when focus moves to another app; each opening starts with an empty field.
@MainActor
final class QuickAddController: NSObject, NSWindowDelegate, BridgeHost {
    private var panel: NSPanel?
    private var web: NeedtWebView?
    private var keyMonitor: Any?

    static let size = NSSize(width: 620, height: 142)

    var isVisible: Bool { panel?.isVisible ?? false }

    func show() {
        if let panel, panel.isVisible {
            panel.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        close()

        let panel = KeyPanel(
            contentRect: NSRect(origin: .zero, size: Self.size),
            styleMask: [.borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self

        let web = NeedtWebView()
        web.bridgeHost = self
        let container = NSView(frame: NSRect(origin: .zero, size: Self.size))
        container.wantsLayer = true
        container.layer?.cornerRadius = 14
        container.layer?.cornerCurve = .continuous
        container.layer?.masksToBounds = true
        panel.contentView = container
        web.webView.frame = container.bounds
        web.webView.autoresizingMask = [.width, .height]
        container.addSubview(web.webView)
        web.offlineHost.frame = container.bounds
        web.offlineHost.autoresizingMask = [.width, .height]
        container.addSubview(web.offlineHost)
        web.onSignedOut = {
            // The session ended: the main window handles it; quick add just closes.
            AppController.shared.quickAdd.close()
            AppController.shared.auth.signedOut()
        }
        web.load(Config.quickAddURL)

        // Upper third of the screen the pointer is on.
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        if let visible = screen?.visibleFrame {
            let origin = NSPoint(
                x: visible.midX - Self.size.width / 2,
                y: visible.maxY - visible.height / 3 - Self.size.height / 2
            )
            panel.setFrameOrigin(origin)
        } else {
            panel.center()
        }

        self.panel = panel
        self.web = web
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53, self?.panel?.isKeyWindow == true {   // Esc
                self?.close()
                return nil
            }
            return event
        }
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
    }

    func close() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
        panel?.orderOut(nil)
        panel?.delegate = nil
        panel?.contentView = nil
        panel = nil
        web = nil
    }

    // Focus moved to another window or app.
    func windowDidResignKey(_ notification: Notification) {
        close()
    }
}
