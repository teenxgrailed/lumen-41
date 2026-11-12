import ManagedSettings
import ManagedSettingsUI
import NeedtKit
import UIKit

/// The shield a person sees on a quit habit's app or site: the habit's reason,
/// the clean streak, and a «Тянет» button (the action extension takes it from
/// there). Everything it shows is read from the app group; it makes no network
/// call. Colours are one text colour at ladder alphas, and the accent is never
/// a button fill.
final class NeedtQuitShieldConfiguration: ShieldConfigurationDataSource {
    private let registry = QuitSelectionRegistry()

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        shield(habitId: application.token.flatMap(registry.habitId(for:)))
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        shield(habitId: application.token.flatMap(registry.habitId(for:)) ?? category.token.flatMap(registry.habitId(for:)))
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        shield(habitId: webDomain.token.flatMap(registry.habitId(for:)))
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        shield(habitId: webDomain.token.flatMap(registry.habitId(for:)) ?? category.token.flatMap(registry.habitId(for:)))
    }

    private func shield(habitId: String?) -> ShieldConfiguration {
        let id = habitId ?? registry.onlyHabitId()
        let record = id.flatMap { QuitStore.load(habitId: $0) }
        let copy = QuitCopy.make(record: record)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor.black.withAlphaComponent(0.55),
            icon: UIImage(systemName: "hand.raised"),
            title: .init(text: copy.title, color: .white),
            subtitle: .init(text: copy.subtitle, color: UIColor.white.withAlphaComponent(0.6)),
            primaryButtonLabel: .init(text: copy.craving, color: .black),
            primaryButtonBackgroundColor: .white,
            secondaryButtonLabel: .init(text: copy.dismiss, color: UIColor.white.withAlphaComponent(0.6))
        )
    }
}
