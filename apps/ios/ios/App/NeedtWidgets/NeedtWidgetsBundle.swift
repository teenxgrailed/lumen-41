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
    // Listed here instead of `NeedtWidgetBundle().body`: that bundle wraps the
    // Controls in `if #available(iOS 18.0, *)`, and in a Release device build
    // that path leaves the SwiftUI `WidgetBundleBuilder.buildOptional` opaque
    // type descriptor unresolved at link time (ios-archive, Xcode 26.6). This
    // target deploys to iOS 18, so the Controls need no availability check.
    //todo: go back to NeedtWidgetBundle once SwiftUI links that path on device.
    var body: some Widget {
        TodayWidget()
        NextEventWidget()
        FocusTimerWidget()
        HabitsWidget()
        QuickAddWidget()
        QuickAddControl()
        StartFocusControl()
        FocusLiveActivity()
    }
}

/// Lets the App Intents metadata extractor find the intents that live in the
/// NeedtWidgetKit and NeedtKit packages.
struct NeedtWidgetsExtensionIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [NeedtWidgetsIntentsPackage.self] }
}
