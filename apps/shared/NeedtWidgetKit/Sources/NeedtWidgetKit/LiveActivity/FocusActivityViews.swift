import NeedtKit
import SwiftUI
#if os(iOS)
import AppIntents
#endif

// The pieces of the focus Live Activity (additions-2 "Live Activity", brief
// 5.1). They take plain `FocusActivityContent`, so a CI snapshot on the Mac
// draws exactly what the Dynamic Island, the Lock Screen and the Mac menu bar
// show. The countdown is only `Text(timerInterval:)`, the ring only
// `ProgressView(timerInterval:)` (drawn static in a snapshot).

struct FocusTitle: View {
    var state: FocusActivityContent

    var body: some View {
        let text = Text(state.title ?? "Focus").lineLimit(1).foregroundStyle(.white)
        if state.showTitle { text } else { text.privacySensitive() }
    }
}

/// The countdown. Paused: frozen at the pause. Ended: the planned minutes.
struct FocusTimeText: View {
    @Environment(\.needt) private var c
    var state: FocusActivityContent
    var size: CGFloat
    var weight: Font.Weight = .regular

    var body: some View {
        Group {
            if state.ended {
                Text("\(state.plannedMinutes) min")
            } else if c.isSnapshot, let interval = state.interval {
                let at = state.pausedAt ?? c.now
                Text(formatClock(Int(max(0, interval.upperBound.timeIntervalSince(at)))))
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
struct FocusActivityRing: View {
    @Environment(\.needt) private var c
    var state: FocusActivityContent
    var diameter: CGFloat
    var lineWidth: CGFloat

    private func progress(at date: Date) -> Double {
        guard let interval = state.interval else { return 0 }
        let total = interval.upperBound.timeIntervalSince(interval.lowerBound)
        return total > 0 ? min(1, max(0, date.timeIntervalSince(interval.lowerBound) / total)) : 0
    }

    var body: some View {
        if state.ended {
            ZStack {
                Circle().stroke(.white.opacity(0.25), lineWidth: lineWidth)
                Image(systemName: "checkmark").font(.system(size: diameter * 0.4, weight: .bold)).foregroundStyle(.white)
            }.frame(width: diameter, height: diameter)
        } else if state.pausedAt != nil || state.interval == nil || c.isSnapshot {
            let p = progress(at: state.pausedAt ?? c.now)
            ZStack {
                Circle().stroke(.white.opacity(0.15), lineWidth: lineWidth)
                Circle().trim(from: 0, to: max(0.01, p)).stroke(.white.opacity(state.pausedAt != nil ? 0.6 : 1), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
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
/// accent fill. On iPhone it is a LiveActivityIntent, so it runs in the app.
struct FocusPauseButton: View {
    @Environment(\.needt) private var c
    var sessionId: String
    var state: FocusActivityContent

    private var label: some View {
        let paused = state.pausedAt != nil
        return HStack(spacing: 6) {
            Image(systemName: paused ? "play.fill" : "pause.fill").font(.system(size: 11, weight: .bold))
            Text(paused ? "Resume" : "Pause").font(.system(size: 13, weight: .semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14).frame(height: 32)
        .overlay(Capsule().strokeBorder(.white.opacity(0.4), lineWidth: 1))
    }

    var body: some View {
        #if os(iOS)
        if !c.isSnapshot {
            Button(intent: PauseFocusActivityIntent(sessionId: sessionId, paused: state.pausedAt != nil)) { label }.buttonStyle(.plain)
        } else {
            label
        }
        #else
        label
        #endif
    }
}

/// Dynamic Island expanded content (371 x about 150): ring and title on the
/// leading side, the time on the trailing side, "Up next" and one Pause below.
struct FocusExpandedView: View {
    var sessionId: String
    var state: FocusActivityContent

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                HStack(spacing: 10) {
                    FocusActivityRing(state: state, diameter: 40, lineWidth: 4)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(state.ended ? "Focus done" : "Focus").font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
                        FocusTitle(state: state).font(.system(size: 15, weight: .semibold))
                    }
                }
                Spacer(minLength: 8)
                FocusTimeText(state: state, size: 34)
            }
            HStack {
                Text(state.upNext.map { "Up next: \($0)" } ?? "")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                    .privacySensitive(!state.showTitle)
                Spacer(minLength: 8)
                if !state.ended { FocusPauseButton(sessionId: sessionId, state: state) }
            }
        }
        .foregroundStyle(.white)
    }
}

/// The Lock Screen banner (also the StandBy and Mac menu bar presentation).
struct FocusLockScreenView: View {
    @Environment(\.needt) private var c
    var sessionId: String
    var state: FocusActivityContent
    var isStale = false

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
                        Text("Ends \(WidgetClock.hhmm(end, calendar: c.calendar)) · Needt")
                    } else {
                        Text("Needt")
                    }
                }
                .font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                Spacer(minLength: 8)
                if !state.ended { FocusPauseButton(sessionId: sessionId, state: state) }
            }
        }
        .foregroundStyle(.white)
    }
}
