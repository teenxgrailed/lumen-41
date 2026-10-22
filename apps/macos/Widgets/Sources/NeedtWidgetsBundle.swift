import AppIntents
import NeedtKit
import NeedtWidgetKit
import SwiftUI
import WidgetKit

/// The Mac WidgetKit extension: Today (small, medium, large, extra large),
/// Next event, Focus timer, Habits and Quick add. Everything is
/// in apps/shared/NeedtWidgetKit; this target is only the entry point.
@main
struct NeedtWidgetsMain: WidgetBundle {
    var body: some Widget {
        NeedtWidgetBundle().body
    }
}

/// Lets the App Intents metadata extractor find the intents in NeedtWidgetKit.
struct NeedtWidgetsExtensionIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [NeedtWidgetsIntentsPackage.self] }
}
