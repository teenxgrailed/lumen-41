import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

// Parts shared by every layout: countdowns (the only live seconds, through
// Text(timerInterval:) and ProgressView(timerInterval:)), the check rows that
// are Toggles in a widget, and the footers.

/// `mm:ss` that WidgetKit counts by itself. In a CI snapshot it is drawn
/// static so the image does not depend on the clock.
struct CountdownText: View {
    @Environment(\.needt) private var c
    var focus: WidgetFocus
    var font: Font

    var body: some View {
        if c.isSnapshot || focus.interval == nil {
            Text(formatClock(focus.secondsLeft(at: c.now) ?? 0)).font(font).monospacedDigit()
        } else if let interval = focus.interval {
            Text(timerInterval: interval, pauseTime: focus.pausedAt, countsDown: true, showsHours: false)
                .font(font).monospacedDigit().multilineTextAlignment(.center)
        }
    }
}

/// The focus ring: `ProgressView(timerInterval:)` while it runs, a frozen ring
/// while it is paused (the entry knows the pause time exactly).
struct FocusRing: View {
    @Environment(\.needt) private var c
    var focus: WidgetFocus
    var diameter: CGFloat
    var lineWidth: CGFloat
    var tint: Color? = nil
    var track: Color? = nil

    var body: some View {
        if c.isSnapshot || focus.isPaused || focus.interval == nil {
            InkRing(progress: focus.progress(at: c.now), diameter: diameter, lineWidth: lineWidth, tint: tint, track: track,
                    frozen: focus.isPaused)
                .opacity(focus.isPaused ? 0.55 : 1)
        } else if let interval = focus.interval {
            ProgressView(timerInterval: interval, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.circular)
                .tint(tint ?? c.palette.accent)
                .frame(width: diameter, height: diameter)
                .widgetAccentable()
        }
    }
}

/// "in 40 min", counted by WidgetKit.
struct UntilText: View {
    @Environment(\.needt) private var c
    var date: Date
    var capitalized = false

    var body: some View {
        if c.isSnapshot {
            Text("\(capitalized ? "In" : "in") \(max(1, Int((date.timeIntervalSince(c.now) / 60).rounded(.up)))) min")
        } else {
            HStack(spacing: 3) {
                Text(capitalized ? "In" : "in")
                Text(date, style: .relative)
            }
        }
    }
}

/// A row of a task list: a check box and a title. In a widget the row is a
/// Toggle bound to an App Intent when `interactive`; otherwise it only draws.
struct CheckRow: View {
    @Environment(\.needt) private var c
    var title: String
    var done: Bool
    var toggleIntent: ToggleTaskIntent? = nil
    var habitIntent: ToggleHabitIntent? = nil
    var trailing: String? = nil
    var subdued = false

    var body: some View {
        if !c.isSnapshot, let toggleIntent {
            Toggle(isOn: done, intent: toggleIntent) { label }.toggleStyle(CheckRowStyle())
        } else if !c.isSnapshot, let habitIntent {
            Toggle(isOn: done, intent: habitIntent) { label }.toggleStyle(CheckRowStyle())
        } else {
            HStack(spacing: 8) {
                InkCheckBox(on: done)
                label
            }
        }
    }

    private var label: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(c.fonts.t13())
                .foregroundStyle(done || subdued ? c.palette.a3 : c.palette.ink)
                .lineLimit(1)
                .titleSensitive(c.showTitles)
            if let trailing {
                Spacer(minLength: 4)
                Text(trailing).font(c.fonts.t12()).monospacedDigit().foregroundStyle(c.palette.a3)
            }
        }
    }
}

struct CheckRowStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            InkCheckBox(on: configuration.isOn)
            configuration.label
        }
    }
}

/// The line under a list: the failure beats the stale note.
struct Footer: View {
    var status: WidgetStatus
    var failed: Bool

    var body: some View {
        if failed {
            FailureLine()
        } else if case .stale(let date) = status {
            StaleLine(date: date)
        }
    }
}

extension WidgetStatus {
    var staleDate: Date? {
        if case .stale(let d) = self { return d }
        return nil
    }
}
