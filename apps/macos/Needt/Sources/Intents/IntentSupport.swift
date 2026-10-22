import AppIntents
import AppKit
import CoreSpotlight
import Foundation
import NeedtKit
import UniformTypeIdentifiers
import WidgetKit

/// An error the Shortcuts and Siri UI can show as plain text.
struct IntentFailure: Error, CustomLocalizedStringResourceConvertible {
    let message: String
    var localizedStringResource: LocalizedStringResource { "\(message)" }
}

/// What every intent shares: the API client signed in with the vault's
/// cookies, the offline rules, and the Spotlight index.
enum IntentSupport {
    /// Intents run in the app's process, so when the vault is still empty (an
    /// install from before the vault) the web view's cookies are the fallback.
    static func api() -> NeedtAPI {
        NeedtAPI(baseURL: Config.base) {
            let stored = CookieVault.shared.load()
            if !stored.isEmpty { return stored }
            return await WebCookies.all()
        }
    }

    /// Runs an API call and turns Needt's errors into messages people can read.
    static func run<T>(_ work: (NeedtAPI) async throws -> T) async throws -> T {
        do {
            return try await work(api())
        } catch let error as NeedtAPIError {
            throw IntentFailure(message: error.message)
        } catch let error as IntentFailure {
            throw error
        } catch {
            throw IntentFailure(message: "Needt could not finish that. Try again.")
        }
    }

    /// Open (not done, not trashed) tasks; offline this is the last cached list.
    static func openTasks(api: NeedtAPI) async throws -> [TaskSummary] {
        let result = try await api.tasksCached()
        let open = result.value.filter { !$0.isDone && $0.trashedAt == nil }
        if !result.isOffline { SpotlightIndex.replace(with: open) }
        return open
    }

    static func entity(_ task: TaskSummary) -> TaskEntity {
        TaskEntity(id: task.id, title: task.title, detail: Digest.timeLabel(task.when))
    }
}

/// Tasks in Spotlight. Plain CoreSpotlight items (macOS 14 has no
/// IndexedEntity); a click comes back as `CSSearchableItemActionType`
/// (AppDelegate.application(_:continue:)).
enum SpotlightIndex {
    static let domain = "app.needt.task"
    static let prefix = "task:"
    private static let limit = 200

    static func replace(with tasks: [TaskSummary]) {
        let index = CSSearchableIndex.default()
        let items = tasks.prefix(limit).map { task -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = task.title
            attributes.contentDescription = Digest.timeLabel(task.when).map { "Needt · \($0)" } ?? "Needt task"
            attributes.dueDate = task.dueDate
            let item = CSSearchableItem(uniqueIdentifier: prefix + task.id, domainIdentifier: domain, attributeSet: attributes)
            item.expirationDate = Date().addingTimeInterval(60 * 60 * 24 * 30)
            return item
        }
        index.deleteSearchableItems(withDomainIdentifiers: [domain]) { _ in
            guard !items.isEmpty else { return }
            index.indexSearchableItems(items, completionHandler: nil)
        }
    }

    static func clear() {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain], completionHandler: nil)
    }

    /// The task id behind a Spotlight click, nil for anything else.
    static func taskID(from activity: NSUserActivity) -> String? {
        guard activity.activityType == CSSearchableItemActionType,
              let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
              id.hasPrefix(prefix)
        else { return nil }
        let raw = String(id.dropFirst(prefix.count))
        return TrayState.validID(raw) ? raw : nil
    }
}

/// Keeps the vault current: the cookies live in the web view's store, the
/// intents and the Share extension read the vault.
@MainActor
enum SessionSync {
    private static var lastPush = Date.distantPast

    static func push(force: Bool = false) {
        guard force || Date().timeIntervalSince(lastPush) > 10 * 60 else { return }
        lastPush = Date()
        Task {
            let cookies = await WebCookies.all()
            CookieVault.shared.store(cookies)
            WidgetCenter.shared.reloadAllTimelines()
            // Fills the Spotlight index and the offline cache.
            _ = try? await IntentSupport.openTasks(api: IntentSupport.api())
        }
    }

    static func clear() {
        lastPush = .distantPast
        CookieVault.shared.clear()
        WidgetCenter.shared.reloadAllTimelines()
        SpotlightIndex.clear()
        OfflineCache.shared.clear()
    }
}
