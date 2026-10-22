#if os(iOS)
import ActivityKit
import NeedtKit
import SwiftUI
import WidgetKit

/// The focus block as a Live Activity (docs/port/widget-design-brief.md 5.1,
/// additions-2 "Live Activity"): compact ring on the left and the countdown on
/// the right, a minimal ring, an expanded view with ONE outlined Pause, and the
/// Lock Screen banner with a 14 pt margin. The activity ends the moment the run
/// ends and its summary stays 20 minutes (FocusActivityController). The Mac
/// menu bar shows the paired iPhone's activity; no Mac code is needed.
/// The pieces themselves are in FocusActivityViews.swift.
@available(iOS 16.2, *)
public struct FocusLiveActivity: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: NeedtFocusAttributes.self) { context in
            FocusLockScreenView(sessionId: context.attributes.sessionId, state: context.state, isStale: context.isStale)
                .padding(14)
                .activityBackgroundTint(Color(rgb: 0x1A1926).opacity(0.92))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 10) {
                        FocusActivityRing(state: context.state, diameter: 40, lineWidth: 4)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(context.state.ended ? "Focus done" : "Focus").font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
                            FocusTitle(state: context.state).font(.system(size: 15, weight: .semibold))
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusTimeText(state: context.state, size: 34)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.upNext.map { "Up next: \($0)" } ?? "")
                            .font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                            .privacySensitive(!context.state.showTitle)
                        Spacer(minLength: 8)
                        if !context.state.ended { FocusPauseButton(sessionId: context.attributes.sessionId, state: context.state) }
                    }
                }
            } compactLeading: {
                FocusActivityRing(state: context.state, diameter: 22, lineWidth: 3)
            } compactTrailing: {
                FocusTimeText(state: context.state, size: 14, weight: .semibold).frame(maxWidth: 52)
            } minimal: {
                FocusActivityRing(state: context.state, diameter: 22, lineWidth: 3)
            }
            .keylineTint(.white.opacity(0.5))
        }
    }
}
#endif
