import AppIntents
import NeedtKit
import NeedtWidgetKit
import SwiftUI
import WidgetKit

/// The WidgetKit extension: Today, Next event, Focus timer, Habits, Quick add,
/// the Quick add and Start focus Controls, and the focus Live Activity. All of
/// it lives in apps/shared/NeedtWidgetKit; this target is only the entry point.
@main
struct NeedtWidgetsMain: WidgetBundle {
    var body: some Widget {
        NeedtWidgetBundle()
    }
}

/// Lets the App Intents metadata extractor find the intents that live in the
/// NeedtWidgetKit and NeedtKit packages.
struct NeedtWidgetsExtensionIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [NeedtWidgetsIntentsPackage.self] }
}
