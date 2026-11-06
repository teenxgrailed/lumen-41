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
    /// click opens the window there. Anything else is dropped. `tag` names
    /// the moment (the web's presenceTag): it is the request's identifier, so
    /// a later notification of the same moment replaces this one, and the
    /// server's push (apns-collapse-id = the same tag) does too.
    func send(title: String, body: String, path: String? = nil, tag: String? = nil, banner: Bool = false) {
        guard let center, !title.isEmpty else { return }
        if banner, let id = Notifier.safeTag(tag) { forceBanner.insert(id) }
        let identifier = Notifier.safeTag(tag) ?? UUID().uuidString
        let request = UNNotificationRequest(
            identifier: identifier,
            content: Notifier.content(title: title, body: body, path: path),
            trigger: nil
        )
        center.add(request, withCompletionHandler: nil)
    }

    /// A habit moment the system shows at its time by itself.
    struct Scheduled {
        let tag: String
        let at: Date
        let title: String
        let body: String
        let path: String?
        /// The person's zone (the setting, not this Mac's): the trigger keeps
        /// the instant if the Mac's zone changes before it fires.
        let timeZone: TimeZone

        init?(json: [String: Any]) {
            guard let tag = Notifier.safeTag(json["tag"] as? String),
                  let raw = json["at"] as? String,
                  let at = Notifier.parseInstant(raw),
                  let title = json["title"] as? String, !title.isEmpty
            else { return nil }
            self.tag = tag
            self.at = at
            self.title = title
            self.body = json["body"] as? String ?? ""
            self.path = json["url"] as? String
            self.timeZone = (json["timeZone"] as? String).flatMap(TimeZone.init(identifier:)) ?? .current
        }
    }

    /// Replace the scheduled habit moments with `items`: ones no longer in
    /// the set (a habit marked done, a time moved) are taken back, the rest
    /// are (re)added under their tag. Only presence tags are touched.
    func schedule(_ items: [Scheduled]) async {
        // One at a time: a second call waits for the first, so two sets never
        // interleave their removals and adds.
        let previous = scheduling
        let next = Task { @MainActor in
            await previous?.value
            await self.replaceScheduled(items)
        }
        scheduling = next
        await next.value
    }

    private var scheduling: Task<Void, Never>?
    /// Presence tags the page asked to show as a banner even with Needt in
    /// front (the island could not say them).
    private var forceBanner = Set<String>()

    /// Every habit moment of this account, pending or shown (sign-out).
    func clearPresence() {
        guard let center else { return }
        Task { @MainActor in
            let pending = await center.pendingNotificationRequests().map(\.identifier).filter(Notifier.isPresenceTag)
            center.removePendingNotificationRequests(withIdentifiers: pending)
            let shown = await center.deliveredNotifications().map(\.request.identifier).filter(Notifier.isPresenceTag)
            center.removeDeliveredNotifications(withIdentifiers: shown)
        }
    }

    private func replaceScheduled(_ items: [Scheduled]) async {
        guard let center else { return }
        let keep = Set(items.map(\.tag))
        let pending = await center.pendingNotificationRequests()
        let stale = pending.map(\.identifier).filter { Notifier.isPresenceTag($0) && !keep.contains($0) }
        if !stale.isEmpty { center.removePendingNotificationRequests(withIdentifiers: stale) }
        let now = Date()
        for item in items.prefix(60) where item.at > now {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = item.timeZone
            let parts = calendar.dateComponents(in: item.timeZone, from: item.at)
            let request = UNNotificationRequest(
                identifier: item.tag,
                content: Notifier.content(title: item.title, body: item.body, path: item.path),
                trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            )
            try? await center.add(request)
        }
    }

    /// Take moments back: not shown yet, or already in Notification Center.
    func cancel(tags: [String]) {
        guard let center else { return }
        let ids = tags.compactMap(Notifier.safeTag)
        guard !ids.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    private static func content(title: String, body: String, path: String?) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(200))
        content.body = String(body.prefix(1000))
        content.sound = .default
        if let path = Notifier.safePath(path) {
            content.userInfo = ["path": path]
        }
        return content
    }

    /// An ISO instant from the page (`toISOString`, with or without the
    /// fractional seconds).
    nonisolated static func parseInstant(_ raw: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }

    /// A presence tag: `rem:<id>:<day>`, `checkin:<day>`, `ms:<id>:<n>`,
    /// `reengage:<day>`; short, plain characters only.
    nonisolated static func safeTag(_ tag: String?) -> String? {
        guard let tag, !tag.isEmpty, tag.count <= 120,
              tag.range(of: #"^[a-z]+:[A-Za-z0-9:_\-]+$"#, options: .regularExpression) != nil
        else { return nil }
        return tag
    }

    nonisolated static func isPresenceTag(_ id: String) -> Bool {
        ["rem:", "checkin:", "ms:", "reengage:"].contains { id.hasPrefix($0) } && safeTag(id) != nil
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
        // A habit moment while Needt is in front: the page's island says it,
        // so no banner over it (it stays in Notification Center until the
        // island takes it back). The page is told; when the island cannot
        // speak (Ask open, a focus, the 20-minute gap) it sends the moment
        // again with `banner`, and that one shows.
        let id = notification.request.identifier
        Task { @MainActor in
            if Notifier.isPresenceTag(id) && NSApp.isActive {
                if Notifier.shared.forceBanner.remove(id) != nil {
                    completionHandler([.banner, .sound])
                } else {
                    completionHandler([.list])
                    AppController.shared.presenceDue(tag: id)
                }
            } else {
                completionHandler([.banner, .sound])
            }
        }
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
