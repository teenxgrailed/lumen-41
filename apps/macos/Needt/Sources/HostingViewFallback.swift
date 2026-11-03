#if NO_ISLAND
import AppKit
import SwiftUI

/// NeedtAppStoreLite only. The other builds get `makeHostingView` from
/// `Island/Sources/helpers/HostingView.swift`; this build compiles nothing from
/// `Island/`, so the same helper is here. Every window-hosted SwiftUI root is
/// made through it so the hosting view publishes no size into its window (see
/// scripts/check-hosting-views.py).
nonisolated func makeHostingView<Content: View>(rootView: Content) -> NSHostingView<Content> {
    MainActor.assumeIsolated {
        let hosting = NSHostingView(rootView: rootView)
        hosting.sizingOptions = []
        return hosting
    }
}

nonisolated func makeHostingController<Content: View>(rootView: Content) -> NSHostingController<Content> {
    MainActor.assumeIsolated {
        let controller = NSHostingController(rootView: rootView)
        controller.sizingOptions = []
        return controller
    }
}
#endif
