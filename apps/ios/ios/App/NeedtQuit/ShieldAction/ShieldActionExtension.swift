import Foundation
import ManagedSettings
import NeedtKit
import UserNotifications

/// What the shield's buttons do. «Тянет» (primary) is meant to open
/// `needt://habits/<id>/panic`. A shield extension cannot open a URL, and the
/// only open-the-app response Apple documents, `.openParentalControlsApp`, is
/// iOS 26.5+ and carries no URL. So the habit id is left in the app group
/// (`QuitPendingPanic`), the app reads it when it comes to the front and opens
/// the panic route, and the way to the front is:
///  - iOS 26.5+ built with `HABITS_QUIT_OPEN_APP`: `.openParentalControlsApp`,
///  - otherwise: close the shielded app and post a local notification whose
///    tap opens Needt.
/// «Закрыть» (secondary) just closes.
final class NeedtQuitShieldAction: ShieldActionDelegate {
    private let registry = QuitSelectionRegistry()

    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, habitId: registry.habitId(for: application), completionHandler)
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, habitId: registry.habitId(for: webDomain), completionHandler)
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, habitId: registry.habitId(for: category), completionHandler)
    }

    private func respond(_ action: ShieldAction, habitId: String?, _ completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed:
            guard QuitFlag.isEnabled(), let id = habitId ?? registry.onlyHabitId(),
                  let link = QuitDeepLink.panic(habitId: id)
            else { return completionHandler(.close) }
            QuitPendingPanic.set(habitId: id)
            #if HABITS_QUIT_OPEN_APP
            if #available(iOS 26.5, *) { return completionHandler(.openParentalControlsApp) }
            #endif
            notify(link: link) { completionHandler(.close) }
        case .secondaryButtonPressed:
            completionHandler(.close)
        @unknown default:
            completionHandler(.close)
        }
    }

    /// The fallback way to the app: a local notification the person taps.
    private func notify(link: URL, then done: @escaping () -> Void) {
        let copy = QuitCopy.make(record: nil)
        let content = UNMutableNotificationContent()
        content.title = copy.craving
        content.body = copy.title
        content.userInfo = ["url": link.absoluteString]
        let request = UNNotificationRequest(identifier: "quit.panic", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in done() }
    }
}
