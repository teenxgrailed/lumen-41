#if os(iOS)
import ActivityKit
import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

/// The focus block as a Live Activity (docs/port/widget-design-brief.md 5.1,
/// additions-2 "Live Activity"): compact ring on the left and the countdown on
/// the right, a minimal ring, an expanded view with ONE outlined Pause, and the
/// Lock Screen banner with a 14 pt margin. The countdown is only ever
/// `Text(timerInterval:)` and the ring only `ProgressView(timerInterval:)`.
/// The activity ends the moment the run ends and its summary stays 20 minutes.
/// The Mac menu bar shows the paired iPhone's activity; no Mac code is needed.
@available(iOS 16.2, *)
public struct FocusLiveActivity: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: NeedtFocusAttributes.self) { context in
            FocusLockScreenView(attributes: context.attributes, state: context.state, isStale: context.isStale)
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
                        if !context.state.ended { FocusPauseButton(attributes: context.attributes, state: context.state) }
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

@available(iOS 16.2, *)
private struct FocusTitle: View {
    var state: NeedtFocusAttributes.ContentState

    var body: some View {
        let text = Text(state.title ?? "Focus").lineLimit(1).foregroundStyle(.white)
        if state.showTitle { text } else { text.privacySensitive() }
    }
}

/// The countdown. Paused: frozen at the pause. Ended: the planned minutes.
@available(iOS 16.2, *)
private struct FocusTimeText: View {
    var state: NeedtFocusAttributes.ContentState
    var size: CGFloat
    var weight: Font.Weight = .regular

    var body: some View {
        Group {
            if state.ended {
                Text("\(state.plannedMinutes) min")
            } else if let interval = state.interval {
                Text(timerInterval: interval, pauseTime: state.pausedAt, countsDown: true, showsHours: false)
            } else {
                Text(state.start, style: .timer)
            }
        }
        .font(.system(size: size, weight: weight, design: size > 20 ? .serif : .default))
        .monospacedDigit().foregroundStyle(.white).multilineTextAlignment(.trailing).lineLimit(1).minimumScaleFactor(0.7)
    }
}

/// The ring: `ProgressView(timerInterval:)` while running, drawn and frozen
/// while paused, a full ring with a check once the run is over.
@available(iOS 16.2, *)
private struct FocusActivityRing: View {
    var state: NeedtFocusAttributes.ContentState
    var diameter: CGFloat
    var lineWidth: CGFloat

    private var frozenProgress: Double {
        guard let interval = state.interval, let at = state.pausedAt else { return 0 }
        let total = interval.upperBound.timeIntervalSince(interval.lowerBound)
        return total > 0 ? min(1, max(0, at.timeIntervalSince(interval.lowerBound) / total)) : 0
    }

    var body: some View {
        if state.ended {
            ZStack {
                Circle().stroke(.white.opacity(0.25), lineWidth: lineWidth)
                Image(systemName: "checkmark").font(.system(size: diameter * 0.4, weight: .bold)).foregroundStyle(.white)
            }.frame(width: diameter, height: diameter)
        } else if state.pausedAt != nil || state.interval == nil {
            ZStack {
                Circle().stroke(.white.opacity(0.15), lineWidth: lineWidth)
                Circle().trim(from: 0, to: max(0.01, frozenProgress)).stroke(.white.opacity(0.6), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }.frame(width: diameter, height: diameter)
        } else if let interval = state.interval {
            ProgressView(timerInterval: interval, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.circular)
                .tint(.white)
                .frame(width: diameter, height: diameter)
        }
    }
}

/// The only control: an outlined Pause (Resume while paused), never a solid
/// accent fill. It is a LiveActivityIntent, so it runs in the app.
@available(iOS 17.0, *)
private struct FocusPauseButton: View {
    var attributes: NeedtFocusAttributes
    var state: NeedtFocusAttributes.ContentState

    var body: some View {
        let paused = state.pausedAt != nil
        Button(intent: PauseFocusActivityIntent(sessionId: attributes.sessionId, paused: paused)) {
            HStack(spacing: 6) {
                Image(systemName: paused ? "play.fill" : "pause.fill").font(.system(size: 11, weight: .bold))
                Text(paused ? "Resume" : "Pause").font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14).frame(height: 32)
            .overlay(Capsule().strokeBorder(.white.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// The Lock Screen banner (also the StandBy and Mac menu bar presentation).
@available(iOS 16.2, *)
struct FocusLockScreenView: View {
    var attributes: NeedtFocusAttributes
    var state: NeedtFocusAttributes.ContentState
    var isStale: Bool

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                HStack(spacing: 10) {
                    FocusActivityRing(state: state, diameter: 40, lineWidth: 4)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(state.ended ? "Focus done" : "Focus · \(state.plannedMinutes) min")
                            .font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                        FocusTitle(state: state).font(.system(size: 15, weight: .semibold))
                    }
                }
                Spacer(minLength: 8)
                FocusTimeText(state: state, size: 34)
            }
            HStack {
                Group {
                    if isStale && !state.ended {
                        Label("Tap to refresh", systemImage: "icloud.slash")
                    } else if let end = state.end, !state.ended {
                        Text("Ends \(end, format: .dateTime.hour().minute()) · Needt")
                    } else {
                        Text("Needt")
                    }
                }
                .font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                Spacer(minLength: 8)
                if #available(iOS 17.0, *), !state.ended { FocusPauseButton(attributes: attributes, state: state) }
            }
        }
        .foregroundStyle(.white)
    }
}
#endif
