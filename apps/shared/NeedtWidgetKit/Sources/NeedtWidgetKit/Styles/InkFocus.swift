import AppIntents
import NeedtKit
import SwiftUI
import WidgetKit

/// D · Ink, Focus timer: small (idle, running, paused, finished), medium with
/// Pause / Done, accessories. The only live numbers are Text(timerInterval:)
/// and ProgressView(timerInterval:); idle and finished are static.
struct InkFocus: View {
    @Environment(\.needt) private var c
    var model: FocusModel

    var body: some View {
        switch c.family {
        case .medium: medium
        case .circular: circular
        case .rectangular: rectangular
        default: small
        }
    }

    private var title: String { model.focus?.title ?? model.lastTitle ?? "Focus" }

    // MARK: small

    @ViewBuilder
    private var small: some View {
        switch model.state {
        case .placeholder:
            VStack(spacing: 10) {
                Circle().fill(c.palette.placeholder).frame(width: 90, height: 90)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        case .signedOut:
            StateCenter(symbol: "person.crop.circle", title: "Sign in to start a focus", detail: nil).widgetURL(NeedtLink.signIn)
        case .idle:
            VStack(spacing: 8) {
                Button(intent: StartFocusWidgetIntent(minutes: model.minutes)) {
                    InkButtonLabel(symbol: "play.fill", title: "Start \(model.minutes) min", height: 40)
                }
                .buttonStyle(.plain)
                Text(model.lastTitle.map { "Last: \($0)" } ?? "Focus without a task")
                    .font(c.fonts.t12()).foregroundStyle(c.palette.a3).lineLimit(1).titleSensitive(c.showTitles)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .finished:
            StateCenter(symbol: "checkmark", title: "Focus done", detail: model.focus?.plannedMinutes.map { "\($0) min" })
                .widgetURL(NeedtLink.focus)
        case .running, .paused:
            if let f = model.focus { ringBlock(f) }
        }
    }

    private func ringBlock(_ f: WidgetFocus) -> some View {
        let content = ZStack {
            FocusRing(focus: f, diameter: 98, lineWidth: 5)
            VStack(spacing: 1) {
                CountdownText(focus: f, font: c.fonts.num(26)).foregroundStyle(c.palette.ink)
                Text(f.isPaused ? "Paused" : (f.title ?? "Focus"))
                    .font(c.fonts.t12()).foregroundStyle(c.palette.a3).lineLimit(1).titleSensitive(c.showTitles)
            }
            .frame(width: 76)
        }
        return Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) { content }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: medium

    @ViewBuilder
    private var medium: some View {
        if let f = model.focus, model.state == .running || model.state == .paused {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    InkMark()
                    Text(f.isPaused ? "Focus · paused" : "Focus").font(c.fonts.t12()).foregroundStyle(c.palette.a2)
                }
                Text(f.title ?? "Focus").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).lineLimit(1).padding(.top, 4)
                    .titleSensitive(c.showTitles)
                Spacer(minLength: 0)
                HStack(alignment: .bottom) {
                    CountdownText(focus: f, font: c.fonts.num(34)).foregroundStyle(c.palette.ink).minimumScaleFactor(0.7).lineLimit(1)
                    Spacer(minLength: 8)
                    HStack(spacing: 8) {
                        Button(intent: ToggleFocusPauseWidgetIntent(sessionId: f.sessionId, paused: f.isPaused)) {
                            InkButtonLabel(symbol: f.isPaused ? "play.fill" : "pause.fill", title: f.isPaused ? "Resume" : "Pause")
                        }.buttonStyle(.plain)
                        Button(intent: FinishFocusWidgetIntent(sessionId: f.sessionId)) {
                            InkButtonLabel(symbol: "checkmark", title: "Done")
                        }.buttonStyle(.plain)
                    }
                }
                progressBar(f).padding(.top, 12)
            }
        } else {
            small
        }
    }

    @ViewBuilder
    private func progressBar(_ f: WidgetFocus) -> some View {
        if c.isSnapshot || f.isPaused || f.interval == nil {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.palette.well)
                    Capsule().fill(c.palette.ink).frame(width: geo.size.width * f.progress(at: c.now))
                }
            }.frame(height: 6)
        } else if let interval = f.interval {
            ProgressView(timerInterval: interval, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear)
                .tint(c.palette.ink)
                .frame(height: 6)
        }
    }

    // MARK: Lock Screen

    @ViewBuilder
    private var circular: some View {
        if let f = model.focus, model.state == .running || model.state == .paused {
            ZStack {
                FocusRing(focus: f, diameter: 62, lineWidth: 4)
                CountdownText(focus: f, font: .system(size: 12, weight: .bold)).foregroundStyle(c.palette.ink).frame(width: 40)
                    .minimumScaleFactor(0.6)
            }
            .widgetURL(NeedtLink.focus)
        } else {
            Image(systemName: "play.fill").font(.system(size: 20)).widgetURL(NeedtLink.focus)
        }
    }

    @ViewBuilder
    private var rectangular: some View {
        if let f = model.focus, model.state == .running || model.state == .paused {
            VStack(alignment: .leading, spacing: 1) {
                Text(f.isPaused ? "Focus · paused" : "Focus").font(.system(size: 13)).foregroundStyle(c.palette.a2)
                CountdownText(focus: f, font: .system(size: 22, weight: .semibold)).foregroundStyle(c.palette.ink)
                Text(f.title ?? "").font(.system(size: 13)).foregroundStyle(c.palette.a3).lineLimit(1).titleSensitive(c.showTitles)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.focus)
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text("Focus").font(.system(size: 14, weight: .semibold))
                Text("Start \(model.minutes) min").font(.system(size: 13)).foregroundStyle(c.palette.a2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.focus)
        }
    }
}
