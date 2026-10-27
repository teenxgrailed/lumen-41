import AppKit
import UserNotifications

/// The web app's `Notification` shim lands here: native notifications through
/// UNUserNotificationCenter. Permission is the system's own prompt.
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifier()

    private var center: UNUserNotificationCenter? {
        // An unbundled run (tests, a bare executable) has no notification center.
        Bundle.main.bundleIdentifier == nil ? nil : UNUserNotificationCenter.current()
    }

    func start() {
        center?.delegate = self
    }

    func isGranted() async -> Bool {
        guard let center else { return false }
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional: return true
        default: return false
        }
    }

    func request() async -> Bool {
        guard let center else { return false }
        if await isGranted() { return true }
        return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// `path` is a same-origin path (from the page's notification feed); a
    /// click opens the window there. Anything else is dropped.
    func send(title: String, body: String, path: String? = nil) {
        guard let center, !title.isEmpty else { return }
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(200))
        content.body = String(body.prefix(1000))
        content.sound = .default
        if let path = Notifier.safePath(path) {
            content.userInfo = ["path": path]
        }
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        center.add(request, withCompletionHandler: nil)
    }

    /// A path inside the app: one leading slash, no scheme, bounded length.
    nonisolated static func safePath(_ path: String?) -> String? {
        guard let path, path.count <= 512, path.hasPrefix("/"), !path.hasPrefix("//"),
              !path.contains("\\"), !path.contains("\n")
        else { return nil }
        return path
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let path = Notifier.safePath(response.notification.request.content.userInfo["path"] as? String)
        Task { @MainActor in
            AppController.shared.showMain()
            if let path { AppController.shared.navigate(path) }
        }
        completionHandler()
    }
}
