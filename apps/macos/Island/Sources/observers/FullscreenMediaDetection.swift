import ApplicationServices
import Defaults
import SwiftUI

struct FullscreenWindowInfo {
    let processId: pid_t
    let bundleIdentifier: String?
    let screen: NSScreen
}

class FullscreenMediaDetector: ObservableObject {
    static let shared = FullscreenMediaDetector()
    @ObservedObject private var musicManager = MusicManager.shared
    @MainActor @Published private(set) var fullscreenStatus: [String: Bool] = [:]
    private var notificationTask: Task<Void, Never>?

    private init() {
        setupNotificationObservers()
        updateFullScreenStatus()
    }

    /// Finds on-screen app windows that cover an entire display.
    private func detectFullscreenApps() -> [FullscreenWindowInfo] {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        var result: [FullscreenWindowInfo] = []
        for info in list {
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  let pid = info[kCGWindowOwnerPID as String] as? pid_t,
                  let boundsDict = info[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: boundsDict) else { continue }
            for screen in NSScreen.screens {
                guard let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID else { continue }
                let displayBounds = CGDisplayBounds(displayID)
                if bounds.width >= displayBounds.width, bounds.height >= displayBounds.height,
                   bounds.intersects(displayBounds) {
                    let bundleID = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
                    result.append(FullscreenWindowInfo(processId: pid, bundleIdentifier: bundleID, screen: screen))
                }
            }
        }
        return result
    }

    private func setupNotificationObservers() {
        notificationTask = Task { @Sendable [weak self] in
            await withTaskGroup(of: Void.self) { group in
                group.addTask {
                    let activeSpaceNotifications = NSWorkspace.shared.notificationCenter.notifications(
                        named: NSWorkspace.activeSpaceDidChangeNotification
                    )
                    
                    for await _ in activeSpaceNotifications {
                        await self?.handleChange()
                    }
                }
                
                group.addTask {
                    let screenParameterNotifications = NSWorkspace.shared.notificationCenter.notifications(
                        named:  NSApplication.didChangeScreenParametersNotification
                    )
                    
                    for await _ in screenParameterNotifications {
                        await  self?.handleChange()
                    }
                }
            }
        }
    }

    private func handleChange() async {
        try? await Task.sleep(for: .milliseconds(500))
        self.updateFullScreenStatus()
    }

    private func updateFullScreenStatus() {
        guard Defaults[.enableFullscreenMediaDetection] else {
            let reset = Dictionary(uniqueKeysWithValues: NSScreen.screens.map { ($0.localizedName, false) })
            if reset != fullscreenStatus {
                fullscreenStatus = reset
            }
            return
        }
        

        let apps = detectFullscreenApps()
        let names = NSScreen.screens.map { $0.localizedName }
        let hideOption = Defaults[.hideNotchOption]

        var newStatus: [String: Bool] = [:]
        for name in names {
            newStatus[name] = apps.contains { app in
                guard app.screen.localizedName == name,
                      app.bundleIdentifier != "com.apple.finder" else { return false }

                // The notch stays on display by default (the window's collectionBehavior
                // rides along with fullscreen spaces). It only hides when the user's
                // "Hide DynamicIsland" option asks for it.
                switch hideOption {
                case .always:
                    // Hide for any app in genuine native fullscreen on this screen.
                    return isInNativeFullscreen(app)
                case .nowPlayingOnly:
                    // Hide only when the currently playing media app is in fullscreen.
                    return app.bundleIdentifier == musicManager.bundleIdentifier
                        && isInNativeFullscreen(app)
                case .never:
                    // Always on display; never hide.
                    return false
                }
            }
        }

        if newStatus != fullscreenStatus {
            fullscreenStatus = newStatus
            NSLog("✅ Fullscreen status: \(newStatus)")
        }
    }

    /// Confirms an app the detector flagged as screen-filling is in *genuine* native
    /// fullscreen, not merely maximized/zoomed. On a notched Mac a maximized window and a
    /// fullscreen window report nearly identical frames, so frame size alone can't tell them
    /// apart — the Accessibility `AXFullScreen` attribute can. Falls back to the detector's
    /// frame-based result when Accessibility isn't trusted (so behavior doesn't silently break).
    private func isInNativeFullscreen(_ app: FullscreenWindowInfo) -> Bool {
        guard AXIsProcessTrusted() else { return true }

        let appElement = AXUIElementCreateApplication(app.processId)

        // Prefer the focused window, then fall back to scanning all windows.
        if let focused: AXUIElement = copyAttribute(kAXFocusedWindowAttribute as CFString, from: appElement),
           isWindowFullscreen(focused) {
            return true
        }

        if let windows: [AXUIElement] = copyAttribute(kAXWindowsAttribute as CFString, from: appElement) {
            return windows.contains { isWindowFullscreen($0) }
        }

        return false
    }

    private func isWindowFullscreen(_ window: AXUIElement) -> Bool {
        // "AXFullScreen" is the (undocumented but stable) attribute set true only in native
        // fullscreen; maximized/zoomed windows report false or omit it.
        let value: Bool? = copyAttribute("AXFullScreen" as CFString, from: window)
        return value ?? false
    }

    private func copyAttribute<T>(_ attribute: CFString, from element: AXUIElement) -> T? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success,
              let typed = value as? T else { return nil }
        return typed
    }

    private func cleanupNotificationObservers() {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    deinit {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }
}
