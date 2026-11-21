import FamilyControls
import Foundation
import ManagedSettings
import NeedtKit

/// Puts the shield for one habit up or down. One named `ManagedSettingsStore`
/// per habit, so clearing one habit never touches another. Compiled into the app
/// and the DeviceActivity monitor extension.
enum QuitShieldController {
    static func store(habitId: String) -> ManagedSettingsStore {
        ManagedSettingsStore(named: ManagedSettingsStore.Name("quit-\(habitId)"))
    }

    static func apply(habitId: String, selection: FamilyActivitySelection) {
        guard QuitDeepLink.isValid(habitId: habitId) else { return }
        let store = store(habitId: habitId)
        let apps = selection.applicationTokens
        let domains = selection.webDomainTokens
        let categories = selection.categoryTokens
        store.shield.applications = apps.isEmpty ? nil : apps
        store.shield.webDomains = domains.isEmpty ? nil : domains
        store.shield.applicationCategories = categories.isEmpty ? nil : .specific(categories)
        store.shield.webDomainCategories = categories.isEmpty ? nil : .specific(categories)
    }

    static func clear(habitId: String) {
        guard QuitDeepLink.isValid(habitId: habitId) else { return }
        store(habitId: habitId).clearAllSettings()
    }
}
