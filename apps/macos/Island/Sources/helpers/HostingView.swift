import AppKit
import SwiftUI

/// The only place a window-hosted SwiftUI root is created.
///
/// With the default sizing options an `NSHostingView` pushes its ideal size
/// into its window's min/max size and its intrinsic size on every layout pass.
/// A ticking countdown, a spring or a lyrics line then changes that size from
/// inside the "Update Constraints in Window" pass, and AppKit aborts the app
/// when the pass limit is exceeded. Every window here is sized from code, so
/// the hosting view publishes nothing. CI (scripts/check-hosting-views.py)
/// fails on any hosting view built without `sizingOptions = []`.
///
/// Callable from nonisolated code (some managers are not main-actor); AppKit
/// views are main-thread only, so this asserts it.
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

/// Ideal size of a SwiftUI root, measured on a throwaway hosting view that is
/// never attached to a window, so it cannot feed anything back into one.
nonisolated func idealHostingSize<Content: View>(of rootView: Content) -> CGSize {
    MainActor.assumeIsolated {
        let probe = NSHostingView(rootView: rootView)
        let size = probe.fittingSize
        return CGSize(width: ceil(size.width), height: ceil(size.height))
    }
}
